import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Store, 
  Send, 
  Package, 
  Clock, 
  BarChart3, 
  Settings, 
  Plus, 
  CheckCircle2, 
  X, 
  Trash2, 
  Compass, 
  Radio, 
  Check, 
  Power,
  Search,
  AlertTriangle,
  Loader2,
  QrCode,
  Scan,
  Navigation
} from 'lucide-react';
import { 
  searchProducts, 
  getStoreInventory, 
  addStoreInventory, 
  updateStoreInventory, 
  deleteStoreInventory, 
  checkDuplicateProduct, 
  createGlobalProduct, 
  fetchCategories,
  getMyShops,
  getIncomingRequests,
  respondToLiveRequest,
  setShopLiveStatus,
  updateShop,
  validateHoldQr,
  collectHold,
  type DuplicateCheckResult,
  type ShopProfileDto,
  type ValidateHoldQrResponseDto
} from '../services/api';
import type { StoreInventoryItem, ProductSearchResult, CategoryDto, LiveRequestSummary, ProductVariantDto } from '../types';

interface VendorDashboardPageProps {
  onSwitchToCustomer: () => void;
  onNavigateToVendorLanding?: () => void;
  onNavigateToAdmin?: () => void;
}

type DashboardTab = 'requests' | 'inventory' | 'holds' | 'analytics' | 'settings';

interface VendorRequestItem extends LiveRequestSummary {
  product?: string;
  distance?: string;
  timeAgo?: string;
  shopperName?: string;
  size?: string;
  budget?: string;
}

export const VendorDashboardPage: React.FC<VendorDashboardPageProps> = ({
  onSwitchToCustomer,
  onNavigateToVendorLanding: _onNavigateToVendorLanding,
  onNavigateToAdmin: _onNavigateToAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('requests');
  const [isLiveOnline, setIsLiveOnline] = useState(false);

  // Store profile
  const [userShops, setUserShops] = useState<ShopProfileDto[]>([]);
  const [storeName, setStoreName] = useState('');
  const [storeCategory, setStoreCategory] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeHours, setStoreHours] = useState('10:00 AM – 9:30 PM (Mon–Sun)');
  const [storeLat, setStoreLat] = useState<number | undefined>(undefined);
  const [storeLng, setStoreLng] = useState<number | undefined>(undefined);
  const [isDetectingStoreGps, setIsDetectingStoreGps] = useState(false);
  const [storeGpsFeedback, setStoreGpsFeedback] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ message: string; isError: boolean } | null>(null);

  const showToast = (message: string, isError: boolean = false) => {
    setActionNotice({ message, isError });
    setTimeout(() => setActionNotice(null), 4000);
  };

  // Store ID
  const [currentStoreId, setCurrentStoreId] = useState<string>('');

  // Modal Visibility State
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);

  // Incoming Live Requests State
  const [requests, setRequests] = useState<VendorRequestItem[]>([]);

  // Active Walk-In Holds State
  const [holds, setHolds] = useState<any[]>([]);

  // QR Scan & Verification state
  const [qrInput, setQrInput] = useState('');
  const [isValidatingQr, setIsValidatingQr] = useState(false);
  const [validatedHoldResult, setValidatedHoldResult] = useState<ValidateHoldQrResponseDto | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);

  const handleValidateQr = async (tokenOrCodeToVerify?: string) => {
    const code = tokenOrCodeToVerify || qrInput;
    if (!code.trim() || !currentStoreId) return;
    setIsValidatingQr(true);
    try {
      const res = await validateHoldQr(currentStoreId, code.trim());
      setValidatedHoldResult(res);
      if (!res.isValid) {
        showToast(res.message || 'Hold pass validation failed.', true);
      } else {
        showToast('Hold pass verified successfully!', false);
      }
    } catch (err) {
      console.error(err);
      showToast('Error validating QR pass.', true);
    } finally {
      setIsValidatingQr(false);
    }
  };

  const handleMarkAsCollected = async (holdId: string) => {
    if (!currentStoreId || !holdId) return;
    setIsCollecting(true);
    try {
      const res = await collectHold(currentStoreId, holdId);
      if (res.success) {
        showToast(res.message || 'Hold pass marked as collected! Physical inventory updated.', false);
        setValidatedHoldResult(null);
        setQrInput('');
        const inv = await getStoreInventory(currentStoreId);
        setInventory(inv);
      } else {
        showToast(res.message || 'Failed to mark hold as collected.', true);
      }
    } catch (err) {
      console.error(err);
      showToast('Error marking hold as collected.', true);
    } finally {
      setIsCollecting(false);
    }
  };

  const handleAcceptRequest = async (id: string) => {
    if (!currentStoreId) {
      showToast('No active store selected.', true);
      return;
    }
    const res = await respondToLiveRequest(id, currentStoreId);
    if (res && res.success) {
      showToast('Confirmed in-stock! Shopper notified instantly.', false);
      setRequests(previous => previous.map(request => request.id === id ? { ...request, status: 'accepted' } : request));
    } else {
      showToast(res?.message || 'Failed to confirm request availability.', true);
    }
  };

  const handleDeclineRequest = (id: string) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'declined' } : r));
  };

  // Inventory State
  const [inventory, setInventory] = useState<StoreInventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState<boolean>(false);

  // Catalog Search & Add Inventory State
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [catalogResults, setCatalogResults] = useState<ProductSearchResult[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  
  // Store-specific inventory input fields
  const [itemPrice, setItemPrice] = useState('');
  const [itemQuantity, setItemQuantity] = useState('2');
  const [itemShelf, setItemShelf] = useState('');

  // Create New Product Fallback State
  const [showCreateProductForm, setShowCreateProductForm] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdModel, setNewProdModel] = useState('');
  const [newProdGtin, setNewProdGtin] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('Electronics');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdImage, setNewProdImage] = useState('');
  const [duplicateCheckWarning, setDuplicateCheckWarning] = useState<DuplicateCheckResult | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  // Categories list for product creation
  const [dbCategories, setDbCategories] = useState<CategoryDto[]>([]);

  // Select a specific shop from user's multi-store portfolio
  const handleSelectShop = async (shop: ShopProfileDto) => {
    const storeId = shop.id.toString();
    setCurrentStoreId(storeId);
    setStoreName(shop.name || '');
    setStoreAddress(shop.address || '');
    setStorePhone(shop.phone || '');
    setStoreCategory(shop.categories?.map((c) => c.name).join(', ') || shop.categoryName || '');
    setStoreLat(shop.latitude);
    setStoreLng(shop.longitude);
    setIsLiveOnline(Boolean(shop.isLiveEnabled));
    setInventoryLoading(true);
    try {
      const [incoming, inv] = await Promise.all([
        getIncomingRequests(storeId),
        getStoreInventory(storeId)
      ]);
      setRequests(incoming.map((request) => ({
        ...request,
        product: request.requestText,
        status: request.status?.toLowerCase() || 'pending',
        distance: request.distanceToShopKm ? `${request.distanceToShopKm.toFixed(1)} km away` : 'Nearby',
        timeAgo: new Date(request.createdAtUtc).toLocaleString()
      })));
      setInventory(inv);
    } catch (err) {
      console.error('Failed switching store:', err);
    } finally {
      setInventoryLoading(false);
    }
  };

  // Initial Data Fetching
  useEffect(() => {
    async function initVendorData() {
      setInventoryLoading(true);
      try {
        const shops = await getMyShops();
        setUserShops(shops);
        const storeId = shops[0]?.id?.toString() || '';
        setCurrentStoreId(storeId);
        
        if (shops && shops.length > 0) {
          setStoreName(shops[0].name || '');
          setStoreAddress(shops[0].address || '');
          setStorePhone(shops[0].phone || '');
          setStoreCategory(shops[0].categories?.map((c) => c.name).join(', ') || shops[0].categoryName || '');
          setStoreLat(shops[0].latitude);
          setStoreLng(shops[0].longitude);
          setIsLiveOnline(Boolean(shops[0].isLiveEnabled));
          const incoming = await getIncomingRequests(storeId);
          setRequests(incoming.map((request) => ({ ...request, product: request.requestText, status: request.status?.toLowerCase() || 'pending', distance: request.distanceToShopKm ? `${request.distanceToShopKm.toFixed(1)} km away` : 'Nearby', timeAgo: new Date(request.createdAtUtc).toLocaleString() })));
          setHolds([]);
        }

        if (storeId) setInventory(await getStoreInventory(storeId));

        const cats = await fetchCategories();
        setDbCategories(cats);
      } catch (err) {
        console.error('Failed loading vendor inventory:', err);
      } finally {
        setInventoryLoading(false);
      }
    }
    initVendorData();
  }, []);

  // Poll for live shopper broadcast requests every 4 seconds
  useEffect(() => {
    if (!currentStoreId) return;
    const interval = setInterval(async () => {
      try {
        const incoming = await getIncomingRequests(currentStoreId);
        setRequests(incoming.map((request) => ({
          ...request,
          product: request.requestText,
          status: request.status?.toLowerCase() || 'pending',
          distance: request.distanceToShopKm ? `${request.distanceToShopKm.toFixed(1)} km away` : 'Nearby',
          timeAgo: new Date(request.createdAtUtc).toLocaleString()
        })));
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [currentStoreId]);

  // Debounced Catalog Search
  useEffect(() => {
    const query = catalogSearchQuery.trim();
    if (!query) {
      const resetTimer = setTimeout(() => setCatalogResults([]), 0);
      return () => clearTimeout(resetTimer);
    }
    const timer = setTimeout(async () => {
      setIsSearchingCatalog(true);
      const results = await searchProducts(query);
      setCatalogResults(results);
      setIsSearchingCatalog(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [catalogSearchQuery]);

  // Select a product from catalog search
  const handleSelectCatalogProduct = (prod: ProductSearchResult) => {
    setSelectedProduct(prod);
    if (prod.variants && prod.variants.length > 0) {
      setSelectedVariantId(prod.variants[0].id.toString());
    }
  };

  // Detect store GPS location & reverse-geocode address
  const handleDetectStoreLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.', true);
      return;
    }

    setIsDetectingStoreGps(true);
    setStoreGpsFeedback(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy ? Math.round(position.coords.accuracy) : null;
        setStoreLat(lat);
        setStoreLng(lng);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
              headers: { 'Accept-Language': 'en' },
              signal: controller.signal
            }
          );
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            const addr = data.address || {};

            const neighborhood = addr.suburb || addr.neighbourhood || addr.residential || addr.commercial || addr.quarter || addr.city_district || '';
            const city = addr.city || addr.town || addr.municipality || addr.village || addr.county || addr.state_district || '';
            const postcode = addr.postcode || '';

            const streetParts = [
              addr.house_number,
              addr.building,
              addr.road || addr.pedestrian || addr.footway || addr.path,
              neighborhood,
              city,
              postcode ? `PIN: ${postcode}` : ''
            ].filter(Boolean);

            const detectedAddress = streetParts.length > 0
              ? streetParts.join(', ')
              : (data.display_name ? data.display_name.split(',').slice(0, 3).join(', ') : '');

            if (detectedAddress) setStoreAddress(detectedAddress);

            setStoreGpsFeedback(
              `📍 Detected: ${city || neighborhood || 'Current GPS'} (${lat.toFixed(4)}°, ${lng.toFixed(4)}°${accuracy ? ` · ±${accuracy}m` : ''})`
            );
            showToast('Store GPS coordinates and address auto-detected!', false);
          } else {
            setStoreGpsFeedback(`📍 Location Pinned: (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`);
            showToast('Store GPS coordinates pinned!', false);
          }
        } catch (geoErr) {
          console.warn('Reverse geocode error or timeout:', geoErr);
          setStoreGpsFeedback(`📍 Location Pinned: (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`);
        } finally {
          setIsDetectingStoreGps(false);
        }
      },
      (error) => {
        setIsDetectingStoreGps(false);
        showToast(`Location error: ${error.message || 'Unable to retrieve GPS coordinates.'}`, true);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // Save Store Settings
  const handleSaveStoreSettings = async () => {
    if (!currentStoreId) {
      showToast('No active store found to update.', true);
      return;
    }
    setIsSavingSettings(true);
    const updated = await updateShop(currentStoreId, {
      name: storeName,
      phone: storePhone,
      address: storeAddress,
      latitude: storeLat,
      longitude: storeLng
    });
    setIsSavingSettings(false);
    if (updated) {
      showToast('Store profile & GPS coordinates updated successfully in database!', false);
    } else {
      showToast('Failed to update store settings.', true);
    }
  };

  // Add Inventory to Store
  const handleSaveInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariantId || !itemPrice || !itemQuantity) {
      showToast('Please fill in price and quantity.', true);
      return;
    }

    const newItem = await addStoreInventory(currentStoreId, {
      productVariantId: selectedVariantId,
      price: parseFloat(itemPrice),
      quantity: parseInt(itemQuantity),
      shelfLocation: itemShelf || 'Shelf Main'
    });

    if (newItem) {
      const refreshed = await getStoreInventory(currentStoreId);
      setInventory(refreshed);
      showToast('Inventory item added successfully!', false);
      resetModalState();
    } else {
      showToast('Failed to add store inventory. Please ensure variant ID is valid.', true);
    }
  };

  // Check Duplicate Product before Creation
  const handleCheckAndCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;

    setIsCheckingDuplicate(true);
    const check = await checkDuplicateProduct(
      newProdGtin.trim(),
      newProdBrand.trim(),
      newProdModel.trim(),
      newProdName.trim()
    );
    setIsCheckingDuplicate(false);

    const isDup = check && (check.possibleDuplicateFound || check.isDuplicate);
    const matched = check?.matchedProduct || check?.matchingProduct;

    if (isDup && matched) {
      setDuplicateCheckWarning(check);
      return;
    }

    // Proceed to create
    await executeProductCreation();
  };

  const executeProductCreation = async () => {
    const matchedCategory = dbCategories.find(c => c.name.toLowerCase() === newProdCategory.toLowerCase());
    const categoryId = matchedCategory ? matchedCategory.id.toString() : (dbCategories[0]?.id?.toString() || '00000000-0000-0000-0000-000000000001');

    const created = await createGlobalProduct({
      name: newProdName,
      brandName: newProdBrand || 'Generic',
      categoryId: categoryId,
      modelNumber: newProdModel,
      gtin: newProdGtin,
      description: newProdDesc,
      imageUrl: newProdImage || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80'
    });

    if (created && created.variants && created.variants.length > 0) {
      setSelectedProduct(created);
      setSelectedVariantId(created.variants[0].id.toString());
      setShowCreateProductForm(false);
      setDuplicateCheckWarning(null);
      showToast('New product created in catalog!', false);
    } else {
      showToast('Could not create global product.', true);
    }
  };

  const resetModalState = () => {
    setIsAddItemOpen(false);
    setSelectedProduct(null);
    setSelectedVariantId('');
    setCatalogSearchQuery('');
    setCatalogResults([]);
    setItemPrice('');
    setItemQuantity('2');
    setItemShelf('');
    setShowCreateProductForm(false);
    setDuplicateCheckWarning(null);
  };

  // Toggle Inventory Stock via API
  const handleToggleInventoryStock = async (item: StoreInventoryItem) => {
    const newQty = item.quantity > 0 ? 0 : 3;
    await updateStoreInventory(currentStoreId, item.inventoryId.toString(), {
      price: item.price,
      quantity: newQty,
      shelfLocation: item.shelfLocation,
      isActive: newQty > 0
    });
    const refreshed = await getStoreInventory(currentStoreId);
    setInventory(refreshed);
  };

  // Delete Inventory Item via API
  const handleDeleteInventoryItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to remove this item from your store inventory?')) return;
    await deleteStoreInventory(currentStoreId, itemId.toString());
    const refreshed = await getStoreInventory(currentStoreId);
    setInventory(refreshed);
  };


  const pendingRequestsCount = requests.filter(r => r.status === 'pending').length;
  const activeHoldsCount = holds.filter(h => h.status === 'active').length;

  return (
    <div className="zooner-merchant min-h-screen text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      
      {/* ── TOP MERCHANT HEADER BAR ── */}
      <header className="zooner-merchant-header sticky top-0 z-40 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Store Info & Live Switch */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {userShops.length > 1 ? (
                  <select
                    value={currentStoreId}
                    onChange={(e) => {
                      const selected = userShops.find(s => s.id.toString() === e.target.value);
                      if (selected) handleSelectShop(selected);
                    }}
                    className="bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
                  >
                    {userShops.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-bold text-white text-sm sm:text-base font-['Outfit']">{storeName || 'Merchant Store'}</span>
                )}
                <span className="text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800 px-1.5 py-0.2 rounded">
                  Merchant OS
                </span>
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${isLiveOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span>{isLiveOnline ? 'Live · Accepting Walk-in Requests' : 'Offline'}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            {/* Live Status Toggle */}
            <button
              onClick={async () => {
                if (!currentStoreId) return;
                const nextStatus = !isLiveOnline;
                if (await setShopLiveStatus(currentStoreId, nextStatus)) setIsLiveOnline(nextStatus);
              }}
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                isLiveOnline 
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80 hover:bg-emerald-900/60' 
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <Power className="h-3.5 w-3.5" />
              <span>{isLiveOnline ? 'Online' : 'Go Online'}</span>
            </button>

            {/* Switch to Customer Shopping */}
            <button
              onClick={onSwitchToCustomer}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-xs font-bold text-emerald-300 transition-colors cursor-pointer shadow-sm"
              title="Switch back to Shopping on Zooner"
            >
              <Compass className="h-3.5 w-3.5 text-emerald-400" />
              <span>Switch to Shopping</span>
            </button>
          </div>

        </div>
      </header>

      {/* ── MAIN DASHBOARD CONTAINER ── */}
      <div className="zooner-merchant-content max-w-7xl mx-auto w-full px-4 sm:px-8 py-6 flex-1 flex flex-col md:flex-row gap-6">
        
        {/* ── LEFT SIDEBAR NAVIGATION ── */}
        <aside className="zooner-merchant-nav w-full md:w-64 shrink-0 space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500 px-3 py-2">
            Store Operations
          </div>

          <button
            onClick={() => setActiveTab('requests')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'requests'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Send className="h-4 w-4" />
              <span>Live Requests</span>
            </div>
            {pendingRequestsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-indigo-700">
                {pendingRequestsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('inventory')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'inventory'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Package className="h-4 w-4" />
              <span>Shelf Inventory</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">{inventory.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('holds')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'holds'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4" />
              <span>Walk-in Holds</span>
            </div>
            {activeHoldsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-black">
                {activeHoldsCount}
              </span>
            )}
          </button>

          <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500 px-3 pt-5 pb-2">
            Performance & Admin
          </div>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'analytics'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Footfall Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'settings'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>Store Profile & Hours</span>
          </button>
        </aside>

        {/* ── RIGHT MAIN PANEL ── */}
        <main className="flex-1 space-y-6 text-left">
          
          {/* ── TAB 1: LIVE REQUESTS ── */}
          {activeTab === 'requests' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white font-['Outfit'] flex items-center gap-2">
                    <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
                    Incoming Shopper Broadcasts
                  </h2>
                  <p className="text-xs text-slate-400">Shoppers within 5 km looking for items right now</p>
                </div>
              </div>

              <div className="space-y-3">
                {requests.map(req => (
                  <div 
                    key={req.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      req.status === 'accepted'
                        ? 'bg-emerald-950/20 border-emerald-800/40'
                        : req.status === 'declined'
                        ? 'bg-slate-900/40 border-slate-800 opacity-60'
                        : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 shadow-xl'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-base">{req.product}</h3>
                          {(req.size || req.subCategoryName || req.categoryName) && (
                            <span className="text-xs font-bold text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800">
                              {req.size || req.subCategoryName || req.categoryName}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                          <span>By {req.shopperName || 'Nearby Shopper'}</span>
                          <span>·</span>
                          <span className="text-emerald-400 font-medium">{req.distance}</span>
                          <span>·</span>
                          <span>{req.timeAgo}</span>
                        </div>
                        {req.budget && (
                          <div className="text-xs text-slate-300 mt-2 font-mono">
                            Customer Target Budget: <strong className="text-white">{req.budget}</strong>
                          </div>
                        )}
                      </div>

                      {/* Request Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                        {(req.status === 'pending' || req.status === 'active') && (
                          <>
                            <button
                              onClick={() => handleAcceptRequest(req.id)}
                              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Confirm In-Stock</span>
                            </button>
                            <button
                              onClick={() => handleDeclineRequest(req.id)}
                              className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
                            >
                              Decline
                            </button>
                          </>
                        )}
                        {req.status === 'accepted' && (
                          <span className="text-xs font-bold text-emerald-400 bg-emerald-950 px-3 py-1.5 rounded-xl border border-emerald-800 flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Confirmed & Held 30m ✓</span>
                          </span>
                        )}
                        {req.status === 'declined' && (
                          <span className="text-xs text-slate-500 font-semibold">Declined</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TAB 2: INVENTORY MANAGEMENT ── */}
          {activeTab === 'inventory' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white font-['Outfit']">Physical Shelf Inventory</h2>
                  <p className="text-xs text-slate-400">Manage store inventory attached to the global product catalog</p>
                </div>
                <button
                  onClick={() => { resetModalState(); setIsAddItemOpen(true); }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Shelf Inventory</span>
                </button>
              </div>

              {/* Inventory Table / Grid */}
              <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
                {inventoryLoading ? (
                  <div className="p-8 text-center text-xs text-slate-400 font-mono">Loading store inventory...</div>
                ) : inventory.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <div className="text-sm font-bold text-white">No shelf inventory found.</div>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Search the global catalog to add existing products (e.g. Sony WH-1000XM5, iPhone 15) to your store!
                    </p>
                    <button
                      onClick={() => { resetModalState(); setIsAddItemOpen(true); }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                    >
                      + Add First Product
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {inventory.map((item: StoreInventoryItem) => {
                      const prodName = item.variantName || 'Product Item';
                      const isAvailable = item.availableQuantity > 0 && item.quantity > 0;
                      return (
                        <div key={item.inventoryId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-800/40 transition-colors">
                          <div className="flex items-center gap-3.5">
                            <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-slate-800 border border-slate-700 text-slate-400 font-bold text-xs shrink-0">
                              <Package className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-sm">{prodName}</span>
                                {item.shelfLocation && (
                                  <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950 border border-indigo-800 px-1.5 py-0.2 rounded">
                                    {item.shelfLocation}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-3">
                                <span>Shelf Quantity: <strong>{item.quantity}</strong></span>
                                <span>·</span>
                                <span className="font-mono text-emerald-400 font-bold">
                                  ₹{item.price ? item.price.toLocaleString('en-IN') : '0'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <button
                              onClick={() => handleToggleInventoryStock(item)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                                isAvailable
                                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                                  : 'bg-red-950/60 text-red-400 border-red-800'
                              }`}
                            >
                              {isAvailable ? `In Stock (${item.availableQuantity} available)` : 'Out of Stock'}
                            </button>

                            <button
                              onClick={() => handleDeleteInventoryItem(item.inventoryId)}
                              className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                              title="Delete from Inventory"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 3: ACTIVE HOLDS ── */}
          {activeTab === 'holds' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white font-['Outfit']">Counter Holds & Walk-in Pickup Verifier</h2>
                <p className="text-xs text-slate-400">Scan customer QR codes or verify pass codes to mark items as collected</p>
              </div>

              {/* QR Verification Scanner Box */}
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <QrCode className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white font-['Outfit']">Scan / Verify Customer QR Pass</h3>
                    <p className="text-xs text-slate-400">Scan customer QR pass or enter 4-character pass code to validate reservation before handing item over</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Scan className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      value={qrInput}
                      onChange={(e) => setQrInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleValidateQr()}
                      placeholder="Paste QR token (zhold:...) or enter pass code (e.g. H-4821)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button
                    onClick={() => handleValidateQr()}
                    disabled={isValidatingQr || !qrInput.trim()}
                    className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {isValidatingQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
                    <span>Verify QR Code</span>
                  </button>
                </div>

                {/* Validated Hold Pass Result Dialog Card */}
                {validatedHoldResult && (
                  <div className={`p-5 rounded-2xl border transition-all ${
                    validatedHoldResult.isValid 
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200' 
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${validatedHoldResult.isValid ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                          <span className="text-sm font-bold tracking-wide font-['Outfit']">
                            {validatedHoldResult.isValid ? 'PASS VERIFIED & ACTIVE' : 'INVALID PASS'}
                          </span>
                        </div>
                        <p className="text-xs mt-1 text-slate-300">{validatedHoldResult.message}</p>

                        {validatedHoldResult.isValid && validatedHoldResult.hold && (
                          <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-slate-200 text-xs max-w-lg">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Reserved Product:</span>
                              <span className="font-bold text-white text-sm">{validatedHoldResult.hold.productName} ({validatedHoldResult.hold.variantName})</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Quantity Reserved:</span>
                              <span className="font-bold text-white">{validatedHoldResult.hold.quantity} unit(s)</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Store Price to Collect:</span>
                              <span className="font-black text-emerald-400 text-sm font-['Outfit']">₹{validatedHoldResult.hold.price.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Pass Code:</span>
                              <span className="font-mono font-bold text-white">{validatedHoldResult.hold.holdCode}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {validatedHoldResult.isValid && validatedHoldResult.hold && (
                        <button
                          onClick={() => handleMarkAsCollected(validatedHoldResult.hold!.holdId)}
                          disabled={isCollecting}
                          className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
                        >
                          {isCollecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          <span>Mark as Collected</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {holds.map(hold => (
                  <div key={hold.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-base">{hold.product}</span>
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded">
                          ₹{hold.price.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                        <span>Customer: <strong>{hold.customerName}</strong></span>
                        <span>·</span>
                        <span>{hold.phone}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2.5 py-1 rounded-lg">
                        {hold.expiresIn}
                      </span>
                      {hold.status === 'active' && (
                        <button
                          onClick={() => setHolds(prev => prev.map(h => h.id === hold.id ? { ...h, status: 'completed', expiresIn: 'Picked Up ✓' } : h))}
                          className="px-3.5 py-1.5 rounded-xl bg-white text-black font-bold text-xs hover:bg-slate-200 transition-colors"
                        >
                          Mark Sold
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TAB 4: ANALYTICS ── */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white font-['Outfit']">Store Footfall & Inventory Analytics</h2>
                <p className="text-xs text-slate-400">Live operational performance summary for {storeName || 'Your Storefront'}</p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400">Active Shelf Items</div>
                  <div className="text-2xl font-extrabold text-white font-['Outfit'] mt-1">
                    {inventory.length}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-semibold mt-1">
                    {inventory.filter(i => i.availableQuantity > 0).length} in stock right now
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400">Live Requests</div>
                  <div className="text-2xl font-extrabold text-white font-['Outfit'] mt-1">
                    {requests.length}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-semibold mt-1">
                    {requests.filter(r => r.status === 'pending').length} pending response
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400">Total Stock Units</div>
                  <div className="text-2xl font-extrabold text-white font-['Outfit'] mt-1">
                    {inventory.reduce((acc, i) => acc + (i.quantity || 0), 0)}
                  </div>
                  <div className="text-[11px] text-indigo-400 font-semibold mt-1">
                    {inventory.reduce((acc, i) => acc + (i.availableQuantity || 0), 0)} available for hold
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400">Total Inventory Value</div>
                  <div className="text-2xl font-extrabold text-white font-['Outfit'] mt-1">
                    ₹{inventory.reduce((acc, i) => acc + ((i.price || 0) * (i.quantity || 0)), 0).toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-semibold mt-1">0% commission taken</div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 5: SETTINGS & HOURS ── */}
          {activeTab === 'settings' && (
            <div className="space-y-5 max-w-xl">
              <div>
                <h2 className="text-xl font-bold text-white font-['Outfit']">Store Profile & Location</h2>
                <p className="text-xs text-slate-400">Your verified storefront details on Zooner</p>
              </div>

              {actionNotice && !actionNotice.isError && (
                <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-300 font-semibold">
                  {actionNotice.message}
                </div>
              )}

              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Store Name</label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Primary Category</label>
                  <input
                    type="text"
                    value={storeCategory}
                    onChange={(e) => setStoreCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300 block">Physical Address</label>
                    <button
                      type="button"
                      onClick={handleDetectStoreLocation}
                      disabled={isDetectingStoreGps}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isDetectingStoreGps ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Navigation className="h-3.5 w-3.5" />
                      )}
                      <span>{isDetectingStoreGps ? 'Detecting GPS...' : 'Auto-Detect via GPS'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    placeholder="Shop #, Street Name, Area, City"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
                  />
                  {storeGpsFeedback && (
                    <p className="text-[11px] text-emerald-400 mt-1 font-mono">{storeGpsFeedback}</p>
                  )}
                  {storeLat !== undefined && storeLng !== undefined && !storeGpsFeedback && (
                    <p className="text-[11px] text-slate-400 mt-1 font-mono">
                      📍 Pinned GPS: {storeLat.toFixed(4)}°, {storeLng.toFixed(4)}°
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={storePhone}
                    onChange={(e) => setStorePhone(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Operating Hours</label>
                  <input
                    type="text"
                    value={storeHours}
                    onChange={(e) => setStoreHours(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
                  />
                </div>

                <button
                  onClick={handleSaveStoreSettings}
                  disabled={isSavingSettings}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {isSavingSettings ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Store Profile...</span>
                    </>
                  ) : (
                    <span>Save Store Profile</span>
                  )}
                </button>
              </div>
            </div>
          )}


        </main>

      </div>

      {/* ── ADD SHELF ITEM MODAL (Global Catalog + Store Inventory Flow) ── */}
      <AnimatePresence>
        {isAddItemOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 text-left shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white font-['Outfit']">Add Product to Store Inventory</h3>
                  <p className="text-xs text-slate-400">Link your store to canonical global catalog products</p>
                </div>
                <button onClick={resetModalState} className="p-1 text-slate-400 hover:text-white cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {!showCreateProductForm ? (
                /* STEP 1: CATALOG SEARCH & SELECTION */
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-200 block mb-1">Search Product Catalog</label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={catalogSearchQuery}
                        onChange={(e) => setCatalogSearchQuery(e.target.value)}
                        placeholder="Search by product name, model (e.g. sony xm5, iphone 15)..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Catalog Results Dropdown */}
                  {catalogSearchQuery.trim() && (
                    <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800/60">
                      {isSearchingCatalog ? (
                        <div className="p-3 text-xs text-slate-400 text-center font-mono">Searching canonical catalog...</div>
                      ) : catalogResults.length === 0 ? (
                        <div className="p-3 text-xs text-slate-400 text-center">
                          No matching product found in catalog.
                        </div>
                      ) : (
                        catalogResults.map((prod: ProductSearchResult) => (
                          <div
                            key={prod.id}
                            onClick={() => handleSelectCatalogProduct(prod)}
                            className={`p-3 flex items-center justify-between cursor-pointer hover:bg-indigo-950/40 transition-colors ${
                              selectedProduct?.id === prod.id ? 'bg-indigo-950/70 border-l-4 border-indigo-500' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <img 
                                src={prod.imageUrl || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=150&q=80'} 
                                alt={prod.name} 
                                className="h-10 w-10 rounded-lg object-cover bg-slate-800 shrink-0" 
                              />
                              <div>
                                <div className="text-xs font-bold text-white">{prod.name}</div>
                                <div className="text-[11px] text-slate-400">
                                  {prod.brandName ? `${prod.brandName} · ` : ''}{prod.categoryName || 'General'}
                                </div>
                              </div>
                            </div>
                            <span className="text-xs font-bold text-indigo-400 px-2 py-1 rounded bg-indigo-950 border border-indigo-800">
                              Select
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Selected Product Banner & Form */}
                  {selectedProduct ? (
                    <form onSubmit={handleSaveInventory} className="space-y-4 border-t border-slate-800 pt-4">
                      <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/60 flex items-center gap-3">
                        <img 
                          src={selectedProduct.imageUrl || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=150&q=80'} 
                          alt={selectedProduct.name} 
                          className="h-12 w-12 rounded-lg object-cover bg-slate-800 shrink-0" 
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-mono text-indigo-300 font-bold uppercase">Selected Global Product</div>
                          <div className="text-sm font-bold text-white truncate">{selectedProduct.name}</div>
                          <div className="text-xs text-slate-400">{selectedProduct.brandName}</div>
                        </div>
                      </div>

                      {/* Variant Selection if available */}
                      {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                        <div>
                          <label className="text-xs font-semibold text-slate-300 block mb-1">Product Variant</label>
                          <select
                            value={selectedVariantId}
                            onChange={(e) => setSelectedVariantId(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          >
                            {selectedProduct.variants.map((v: ProductVariantDto) => (
                              <option key={v.id} value={v.id}>
                                {v.variantName} {v.color ? `(${v.color})` : ''} {v.sku ? `- SKU: ${v.sku}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-300 block mb-1">Your Price (₹)</label>
                          <input
                            type="number"
                            value={itemPrice}
                            onChange={(e) => setItemPrice(e.target.value)}
                            placeholder="e.g. 26990"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-300 block mb-1">Quantity</label>
                          <input
                            type="number"
                            value={itemQuantity}
                            onChange={(e) => setItemQuantity(e.target.value)}
                            placeholder="e.g. 2"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-300 block mb-1">Shelf Location</label>
                          <input
                            type="text"
                            value={itemShelf}
                            onChange={(e) => setItemShelf(e.target.value)}
                            placeholder="e.g. A12"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white transition-colors cursor-pointer shadow-lg shadow-indigo-600/30"
                      >
                        Save Inventory to Store
                      </button>
                    </form>
                  ) : (
                    <div className="pt-2 text-center space-y-2 border-t border-slate-800">
                      <p className="text-xs text-slate-400">Can't find this product in the global catalog?</p>
                      <button
                        type="button"
                        onClick={() => setShowCreateProductForm(true)}
                        className="text-xs font-bold text-indigo-400 hover:underline cursor-pointer"
                      >
                        + Create New Global Product
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* STEP 2: CREATE NEW GLOBAL PRODUCT (WITH DUPLICATE PREVENTION) */
                <form onSubmit={handleCheckAndCreateProduct} className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
                      New Global Product Entry
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCreateProductForm(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      ← Back to Search
                    </button>
                  </div>

                  {/* DUPLICATE WARNING ALERT */}
                  {duplicateCheckWarning && duplicateCheckWarning.matchingProduct && (
                    <div className="p-4 rounded-2xl bg-amber-950/70 border border-amber-700/80 space-y-3 text-left">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs font-bold text-amber-300">
                            Potential Duplicate Product Found!
                          </div>
                          <p className="text-xs text-amber-200/80 mt-1">
                            Did you mean: <strong className="text-white">{duplicateCheckWarning.matchingProduct.name}</strong> ({duplicateCheckWarning.matchingProduct.brandName})?
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (duplicateCheckWarning.matchingProduct) {
                              setSelectedProduct(duplicateCheckWarning.matchingProduct);
                              if (duplicateCheckWarning.matchingProduct.variants && duplicateCheckWarning.matchingProduct.variants.length > 0) {
                                setSelectedVariantId(duplicateCheckWarning.matchingProduct.variants[0].id.toString());
                              }
                            }
                            setShowCreateProductForm(false);
                            setDuplicateCheckWarning(null);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs hover:bg-amber-300 transition-colors cursor-pointer"
                        >
                          Yes, Select Existing Product
                        </button>
                        <button
                          type="button"
                          onClick={executeProductCreation}
                          className="px-3 py-1.5 rounded-xl border border-amber-600/60 text-amber-200 font-semibold text-xs hover:bg-amber-900/40 cursor-pointer"
                        >
                          Create New Anyway
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Brand Name *</label>
                    <input
                      type="text"
                      value={newProdBrand}
                      onChange={(e) => setNewProdBrand(e.target.value)}
                      placeholder="e.g. Sony, Apple, Nike"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Product Name *</label>
                    <input
                      type="text"
                      value={newProdName}
                      onChange={(e) => setNewProdName(e.target.value)}
                      placeholder="e.g. Sony WH-1000XM5 Wireless Headphones"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Model Number</label>
                      <input
                        type="text"
                        value={newProdModel}
                        onChange={(e) => setNewProdModel(e.target.value)}
                        placeholder="e.g. WH-1000XM5"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">GTIN / Barcode</label>
                      <input
                        type="text"
                        value={newProdGtin}
                        onChange={(e) => setNewProdGtin(e.target.value)}
                        placeholder="e.g. 4548736132580"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Category</label>
                    <select
                      value={newProdCategory}
                      onChange={(e) => setNewProdCategory(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    >
                      {dbCategories.length > 0 ? (
                        dbCategories.map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))
                      ) : (
                        <>
                          <option value="Electronics">Electronics</option>
                          <option value="Footwear">Footwear</option>
                          <option value="Appliances">Appliances</option>
                          <option value="Clothing">Clothing</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Description</label>
                    <textarea
                      value={newProdDesc}
                      onChange={(e) => setNewProdDesc(e.target.value)}
                      placeholder="Key specifications, features, color, size details..."
                      rows={2}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Image URL</label>
                    <input
                      type="text"
                      value={newProdImage}
                      onChange={(e) => setNewProdImage(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isCheckingDuplicate}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white transition-colors cursor-pointer shadow-lg shadow-indigo-600/30"
                  >
                    {isCheckingDuplicate ? 'Checking Catalog Duplicates...' : 'Create & Proceed to Add Inventory'}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {actionNotice && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl text-xs font-semibold shadow-2xl flex items-center gap-2 border ${
          actionNotice.isError 
            ? 'bg-rose-950/95 text-rose-200 border-rose-800 backdrop-blur-md' 
            : 'bg-emerald-950/95 text-emerald-200 border-emerald-800 backdrop-blur-md'
        }`}>
          <span>{actionNotice.message}</span>
        </div>
      )}

    </div>
  );
};
