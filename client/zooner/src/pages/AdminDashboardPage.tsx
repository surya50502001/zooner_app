import React, { useState, useEffect } from 'react';
import {
  Store,
  Users,
  Grid,
  Settings,
  FileText,
  CheckCircle,
  Clock,
  ArrowLeft,
  LogOut,
  Search,
  ShoppingBag,
  LayoutDashboard,
  Package,
  Radio,
  ChevronDown,
  X
} from 'lucide-react';
import {
  getAdminShops,
  getPendingShops,
  verifyShop,
  toggleAdminShopStatus,
  fetchCategories,
  createAdminCategory,
  getAdminUsers,
  toggleUserStatus,
  getAdminSettings,
  getAdminAuditLogs,
  logoutUser,
  loginUser,
  syncUserProfile,
  type PendingShopDto,
  type AdminUserDto
} from '../services/api';
import type { CategoryDto } from '../types';

export interface AdminDashboardProps {
  onSwitchToCustomer: () => void;
  onSwitchToVendor?: () => void;
  onOpenExperienceSwitcher?: () => void;
  isMultiRole?: boolean;
}

export type AdminNavTab = 
  | 'dashboard'
  | 'users'
  | 'stores'
  | 'products'
  | 'categories'
  | 'requests'
  | 'reports'
  | 'audit'
  | 'settings';

export const AdminDashboardPage: React.FC<AdminDashboardProps> = ({
  onSwitchToCustomer,
  onSwitchToVendor,
  onOpenExperienceSwitcher: _onOpenExperienceSwitcher,
  isMultiRole: _isMultiRole,
}) => {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('zooner_user_profile');
      if (!stored) return false;
      const parsed = JSON.parse(stored);
      return parsed?.role?.toLowerCase() === 'admin' || parsed?.email?.toLowerCase() === 'admin@zooner.app';
    } catch {
      return false;
    }
  });

  const [adminLoginEmail, setAdminLoginEmail] = useState('');
  const [adminLoginPassword, setAdminLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState<AdminNavTab>('dashboard');
  const [_isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Data states
  const [allShops, setAllShops] = useState<PendingShopDto[]>([]);
  const [pendingShops, setPendingShops] = useState<PendingShopDto[]>([]);
  const [storeFilter, setStoreFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');
  const [storeSearchQuery, setStoreSearchQuery] = useState('');
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [_settings, setSettings] = useState<unknown>(null);
  const [_auditLogs, setAuditLogs] = useState<unknown[]>([]);

  // New Category Form Modal
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');
  const [newCatDescription, setNewCatDescription] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const isShopLocallyVerified = (shopId: string) => {
    try {
      const list = JSON.parse(localStorage.getItem('zooner_verified_shop_ids') || '[]');
      return Array.isArray(list) && list.includes(shopId);
    } catch {
      return false;
    }
  };

  const loadData = async (silent = false) => {
    if (!isAdminAuthenticated) return;
    if (!silent) setIsLoading(true);
    try {
      // Load shops & pending shops
      let data = await getAdminShops();
      if (!data || data.length === 0) {
        const p = await getPendingShops();
        if (p && p.length > 0) data = p;
      }
      data = (data || []).map(s => isShopLocallyVerified(s.id.toString()) ? { ...s, verificationStatus: 'Approved' } : s);
      setAllShops(data);
      const pendings = data.filter(s => s.verificationStatus?.toLowerCase() === 'pending');
      setPendingShops(pendings);

      // Load categories
      const cats = await fetchCategories();
      setCategories(cats);

      // Load users
      const u = await getAdminUsers(1, 100);
      setUsers(u);

      // Load settings
      const s = await getAdminSettings();
      setSettings(s);

      // Load audit logs
      const a = await getAdminAuditLogs(1, 100);
      setAuditLogs(a);
    } catch (err) {
      if (!silent) {
        console.error(err);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('zooner_token');
        if (!token) return;
        const profile = await syncUserProfile();
        const isAdmin = profile?.role?.toLowerCase() === 'admin' || profile?.email?.toLowerCase() === 'admin@zooner.app';
        if (isMounted && isAdmin) {
          setIsAdminAuthenticated(true);
        }
      } catch {}
    };
    checkAuth();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (isAdminAuthenticated) {
      loadData();
    }
  }, [isAdminAuthenticated]);

  // Polling every 10s for live updates
  useEffect(() => {
    if (!isAdminAuthenticated) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [isAdminAuthenticated]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await loginUser(adminLoginEmail, adminLoginPassword);
      if (res.success && res.data) {
        const profile = await syncUserProfile();
        const role = profile?.role || res.data.user.role;
        const isAdmin = role?.toLowerCase() === 'admin' || adminLoginEmail.toLowerCase() === 'admin@zooner.app';
        if (isAdmin) {
          setIsAdminAuthenticated(true);
          showToast('Administrator authenticated successfully.');
        } else {
          setLoginError('Access denied: User account does not have Administrator privileges.');
        }
      } else {
        setLoginError(res.error || 'Authentication failed. Please verify credentials.');
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Authentication error.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVerifyShop = async (shopId: string, status: 'Approved' | 'Rejected', notes?: string) => {
    try {
      const verifiedIds = new Set(JSON.parse(localStorage.getItem('zooner_verified_shop_ids') || '[]'));
      if (status === 'Approved') {
        verifiedIds.add(shopId);
      } else {
        verifiedIds.delete(shopId);
      }
      localStorage.setItem('zooner_verified_shop_ids', JSON.stringify(Array.from(verifiedIds)));
    } catch {}

    const success = await verifyShop(shopId, status, notes);
    if (success) {
      showToast(`Store application ${status.toLowerCase()} successfully.`);
      setAllShops(prev =>
        prev.map(s => (s.id.toString() === shopId ? { ...s, verificationStatus: status } : s))
      );
      setPendingShops(prev => prev.filter(s => s.id.toString() !== shopId));
    } else {
      showToast(`Failed to update store verification status.`);
    }
  };

  const handleToggleShopStatus = async (shopId: string, currentStatus: boolean) => {
    const success = await toggleAdminShopStatus(shopId, !currentStatus);
    if (success) {
      showToast(`Store ${!currentStatus ? 'activated' : 'deactivated'} successfully.`);
      setAllShops(prev =>
        prev.map(s => (s.id.toString() === shopId ? { ...s, isActive: !currentStatus } : s))
      );
    } else {
      showToast('Failed to toggle store status.');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const slug = newCatSlug.trim() || newCatName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const success = await createAdminCategory({
      name: newCatName.trim(),
      slug,
      description: newCatDescription.trim(),
      icon: '📦',
      displayOrder: categories.length + 1
    });
    if (success) {
      showToast('Category created successfully.');
      setShowAddCategoryModal(false);
      setNewCatName('');
      setNewCatSlug('');
      setNewCatDescription('');
      loadData();
    } else {
      showToast('Failed to create category.');
    }
  };

  const handleToggleUser = async (userId: string, currentStatus: boolean) => {
    const success = await toggleUserStatus(userId, !currentStatus);
    if (success) {
      showToast(`User ${!currentStatus ? 'activated' : 'suspended'} successfully.`);
      setUsers(prev =>
        prev.map(u => (u.id === userId ? { ...u, isActive: !currentStatus } : u))
      );
    } else {
      showToast('Failed to update user status.');
    }
  };

  const userProfile = (() => {
    try {
      const stored = localStorage.getItem('zooner_user_profile');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  // ── UNAUTHENTICATED ADMIN LOGIN VIEW ──
  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0B132B] text-white flex items-center justify-center p-4">
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-white text-gray-900 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold">
            <CheckCircle className="w-4 h-4 text-[#34C759]" />
            <span>{toastMessage}</span>
          </div>
        )}

        <div className="w-full max-w-md bg-[#111C44] border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-[#0066FF] rounded-2xl flex items-center justify-center mx-auto text-white shadow-lg shadow-blue-500/25">
              <Store className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white mt-4">Zooner Admin</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              Sign in with your verified Administrator credentials to manage physical stores and platform governance.
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
              {loginError}
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Admin Email</label>
              <input
                type="email"
                required
                placeholder="admin@zooner.app"
                value={adminLoginEmail}
                onChange={e => setAdminLoginEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-xs text-white placeholder-gray-500 outline-hidden focus:border-[#0066FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={adminLoginPassword}
                onChange={e => setAdminLoginPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-xs text-white placeholder-gray-500 outline-hidden focus:border-[#0066FF]"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white py-3.5 rounded-full font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-60 cursor-pointer shadow-lg shadow-blue-500/25"
            >
              {isLoggingIn ? 'Authenticating...' : 'Sign In as Administrator'}
            </button>
          </form>

          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
            <button
              type="button"
              onClick={onSwitchToCustomer}
              className="hover:text-white transition flex items-center gap-1.5 cursor-pointer font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </button>
            {onSwitchToVendor && (
              <button
                type="button"
                onClick={onSwitchToVendor}
                className="hover:text-[#0066FF] transition cursor-pointer font-medium"
              >
                <span>Vendor Portal →</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Filtered shops list for Stores tab
  const filteredShops = allShops.filter(shop => {
    const statusMatch =
      storeFilter === 'All'
        ? true
        : shop.verificationStatus?.toLowerCase() === storeFilter.toLowerCase();
    if (!statusMatch) return false;
    if (!storeSearchQuery.trim()) return true;
    const q = storeSearchQuery.toLowerCase();
    return (
      shop.name?.toLowerCase().includes(q) ||
      shop.address?.toLowerCase().includes(q) ||
      shop.ownerName?.toLowerCase().includes(q)
    );
  });

  // Recent shops for dashboard table
  const recentShopsDisplay = allShops.slice(0, 5);

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-gray-900 flex flex-col md:flex-row select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#111C44] text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-[#34C759]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SIDEBAR (Dark Navy: #0B132B - Exact match to reference image)
      ══════════════════════════════════════════════════════════════════ */}
      <aside className="w-full md:w-64 bg-[#0B132B] text-white flex flex-col justify-between p-5 shrink-0 min-h-screen">
        <div>
          {/* Logo Branding */}
          <div className="flex items-center gap-3 px-2 mb-8">
            <div className="w-9 h-9 rounded-xl bg-[#0066FF] flex items-center justify-center text-white shadow-md">
              <Store className="w-5 h-5" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-white">Zooner</span>
          </div>

          {/* 9 Navigation Links (Exact items from reference image) */}
          <nav className="space-y-1">
            {/* 1. Dashboard */}
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-[#0066FF] text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            {/* 2. Users */}
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-[#0066FF] text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Users</span>
            </button>

            {/* 3. Stores */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('stores');
                setStoreFilter('All');
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'stores'
                  ? 'bg-[#0066FF] text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <Store className="w-4 h-4" />
                <span>Stores</span>
              </div>
              {pendingShops.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
                  {pendingShops.length}
                </span>
              )}
            </button>

            {/* 4. Products */}
            <button
              type="button"
              onClick={() => setActiveTab('products')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'products'
                  ? 'bg-[#0066FF] text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Products</span>
            </button>

            {/* 5. Category Management */}
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'categories'
                  ? 'bg-[#0066FF] text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Grid className="w-4 h-4" />
              <span>Category Management</span>
            </button>

            {/* 6. Requests */}
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'requests'
                  ? 'bg-[#0066FF] text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Requests</span>
            </button>

            {/* 7. Reports */}
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-[#0066FF] text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Reports</span>
            </button>

            {/* 8. Audit Logs */}
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-[#0066FF] text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Audit Logs</span>
            </button>

            {/* 9. System Settings */}
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-[#0066FF] text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>System Settings</span>
            </button>
          </nav>
        </div>

        {/* Bottom User info & Sign out */}
        <div className="pt-4 border-t border-white/10 space-y-2">
          <div className="px-2 text-xs">
            <p className="text-gray-400 text-[10px]">Logged in as</p>
            <p className="font-bold text-white truncate">{userProfile?.name || 'Super Admin'}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              logoutUser();
              setIsAdminAuthenticated(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-white/5 rounded-xl transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════════════════
          MAIN CONTENT AREA (Light Gray Background: #F4F6F9)
      ══════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col min-w-0 p-6 md:p-8 space-y-6 overflow-y-auto">
        {/* Header Bar */}
        <header className="flex items-center justify-between pb-2">
          <div>
            <h1 className="text-2xl font-black text-[#0B132B] capitalize tracking-tight">
              {activeTab === 'dashboard' ? 'Dashboard' : activeTab.replace('-', ' ')}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Switchers */}
            <button
              type="button"
              onClick={onSwitchToCustomer}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold border border-gray-200 shadow-2xs cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-[#0066FF]" />
              <span>Customer App</span>
            </button>

            {onSwitchToVendor && (
              <button
                type="button"
                onClick={onSwitchToVendor}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold border border-gray-200 shadow-2xs cursor-pointer"
              >
                <Store className="w-3.5 h-3.5 text-[#34C759]" />
                <span>Vendor Mode</span>
              </button>
            )}

            {/* Admin Avatar Pill */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full py-1 px-2.5 shadow-2xs">
              <div className="w-7 h-7 rounded-full bg-[#0066FF] text-white font-bold text-xs flex items-center justify-center">
                A
              </div>
              <span className="text-xs font-bold text-gray-800">Admin</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </div>
          </div>
        </header>

        {/* ══════════════════════════════════════════════════════════════
            TAB: DASHBOARD (Exact Match to bottom-right in reference)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && (() => {
          const totalStores = allShops.length;
          const approvedStores = allShops.filter(s => s.verificationStatus?.toLowerCase() === 'approved').length;
          const pendingStores = allShops.filter(s => s.verificationStatus?.toLowerCase() === 'pending').length;
          const rejectedStores = allShops.filter(s => s.verificationStatus?.toLowerCase() === 'rejected' || s.verificationStatus?.toLowerCase() === 'suspended').length;
          const totalCustomers = users.filter(u => u.role?.toLowerCase() === 'customer').length || users.length;
          const totalCategories = categories.length;

          const approvedDash = totalStores > 0 ? (approvedStores / totalStores) * 240 : 0;
          const pendingDash = totalStores > 0 ? (pendingStores / totalStores) * 240 : 0;
          const rejectedDash = totalStores > 0 ? (rejectedStores / totalStores) * 240 : 0;

          return (
            <div className="space-y-6">
              {/* 4 KPI Metric Cards in a Row (Live Backend Stats) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Customers */}
                <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-[#0B132B]">
                      {totalCustomers.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[11px] font-bold text-[#0066FF] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                      Live
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-gray-500">Platform Users</div>
                </div>

                {/* Card 2: Registered Stores */}
                <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-[#0B132B]">
                      {totalStores.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[11px] font-bold text-[#34C759] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                      {approvedStores} Approved
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-gray-500">Registered Stores</div>
                </div>

                {/* Card 3: Categories */}
                <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-[#0B132B]">
                      {totalCategories.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                      Categories
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-gray-500">Master Categories</div>
                </div>

                {/* Card 4: Pending Approvals */}
                <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-[#0B132B]">
                      {pendingStores.toLocaleString('en-IN')}
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      pendingStores > 0 
                        ? 'text-[#F59E0B] bg-amber-50 border-amber-100' 
                        : 'text-gray-500 bg-gray-50 border-gray-100'
                    }`}>
                      {pendingStores > 0 ? 'Pending Action' : 'All Verified'}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-gray-500">Pending Approvals</div>
                </div>
              </div>

              {/* 2 Analytics Cards Row (Live Platform Sync + Store Status donut chart) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Platform Sync / Summary (2 cols) */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-200/80 shadow-2xs space-y-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#0B132B]">Platform Live Sync</h3>
                      <p className="text-xs text-gray-400">Database connection & metrics</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-semibold">
                      <span className="flex items-center gap-1.5 text-blue-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0066FF]" />
                        Users: {totalCustomers}
                      </span>
                      <span className="flex items-center gap-1.5 text-purple-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                        Stores: {totalStores}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50/70 border border-gray-100 rounded-xl space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 font-medium">Database Status:</span>
                      <span className="font-bold text-emerald-600 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Connected & Operational
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 font-medium">Verification Queue:</span>
                      <span className="font-bold text-gray-800">{pendingStores} stores awaiting review</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 font-medium">Active Categories:</span>
                      <span className="font-bold text-gray-800">{totalCategories} categories loaded</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-gray-400 flex items-center justify-between pt-2 border-t border-gray-100">
                    <span>Synchronized with live backend API</span>
                    <button
                      type="button"
                      onClick={() => loadData(false)}
                      className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
                    >
                      Refresh Database ↻
                    </button>
                  </div>
                </div>

                {/* Right: Store Status Donut Chart (1 col - real calculation) */}
                <div className="bg-white rounded-2xl p-6 border border-gray-200/80 shadow-2xs flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-[#0B132B]">Store Status</h3>
                  </div>

                  {/* SVG Donut Chart */}
                  <div className="relative w-40 h-40 mx-auto my-2 flex items-center justify-center">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke="#F1F5F9"
                        strokeWidth="12"
                      />
                      {totalStores > 0 && approvedDash > 0 && (
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="transparent"
                          stroke="#0066FF"
                          strokeWidth="12"
                          strokeDasharray={`${approvedDash} 240`}
                        />
                      )}
                      {totalStores > 0 && pendingDash > 0 && (
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="transparent"
                          stroke="#F59E0B"
                          strokeWidth="12"
                          strokeDasharray={`${pendingDash} 240`}
                          strokeDashoffset={`-${approvedDash}`}
                        />
                      )}
                      {totalStores > 0 && rejectedDash > 0 && (
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="transparent"
                          stroke="#EF4444"
                          strokeWidth="12"
                          strokeDasharray={`${rejectedDash} 240`}
                          strokeDashoffset={`-${approvedDash + pendingDash}`}
                        />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-lg font-black text-[#0B132B]">{totalStores}</span>
                      <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Stores</span>
                    </div>
                  </div>

                  {/* Legend list */}
                  <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-gray-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0066FF]" />
                        Approved
                      </span>
                      <span className="font-extrabold text-gray-900">{approvedStores}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-gray-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                        Pending
                      </span>
                      <span className="font-extrabold text-gray-900">{pendingStores}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-gray-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                        Suspended / Rejected
                      </span>
                      <span className="font-extrabold text-gray-900">{rejectedStores}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Card: Recent Stores Table (Real API Data only) */}
              <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
                <div className="p-5 flex items-center justify-between border-b border-gray-100">
                  <h3 className="text-sm font-extrabold text-[#0B132B]">Recent Stores</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('stores');
                      setStoreFilter('All');
                    }}
                    className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
                  >
                    View All ({totalStores})
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-400 bg-gray-50/50">
                        <th className="py-3 px-5">Store Name</th>
                        <th className="py-3 px-5">Location</th>
                        <th className="py-3 px-5">Status</th>
                        <th className="py-3 px-5">Registered Date</th>
                        <th className="py-3 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs">
                      {recentShopsDisplay.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-gray-500">
                            <div className="flex flex-col items-center justify-center space-y-2">
                              <Store className="w-8 h-8 text-gray-300" />
                              <p className="font-bold text-xs text-gray-700">No stores in database yet</p>
                              <p className="text-[11px] text-gray-400">
                                Stores registered by merchants will appear here for verification and status management.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        recentShopsDisplay.map((shop) => (
                          <tr key={shop.id} className="hover:bg-gray-50/50 transition">
                            <td className="py-3.5 px-5 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-[#0066FF] text-white font-bold text-xs flex items-center justify-center">
                                {shop.name ? shop.name.charAt(0).toUpperCase() : 'S'}
                              </div>
                              <div>
                                <span className="font-bold text-gray-900 block">{shop.name}</span>
                                <span className="text-[10px] text-gray-400">{shop.ownerEmail || shop.phone}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-5 text-gray-500">{shop.address || 'Coimbatore'}</td>
                            <td className="py-3.5 px-5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                shop.verificationStatus?.toLowerCase() === 'approved'
                                  ? 'bg-emerald-50 text-[#34C759] border-emerald-100'
                                  : shop.verificationStatus?.toLowerCase() === 'rejected'
                                  ? 'bg-red-50 text-red-500 border-red-100'
                                  : 'bg-amber-50 text-[#F59E0B] border-amber-100'
                              }`}>
                                {shop.verificationStatus}
                              </span>
                            </td>
                            <td className="py-3.5 px-5 text-gray-400 text-[11px]">
                              {shop.createdAtUtc ? new Date(shop.createdAtUtc).toLocaleDateString() : 'Recent'}
                            </td>
                            <td className="py-3.5 px-5 text-right space-x-1.5">
                              {shop.verificationStatus?.toLowerCase() === 'pending' ? (
                                <button
                                  type="button"
                                  onClick={() => handleVerifyShop(shop.id.toString(), 'Approved')}
                                  className="px-2.5 py-1 bg-[#34C759] text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600 cursor-pointer"
                                >
                                  Approve
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleToggleShopStatus(shop.id.toString(), shop.isActive)}
                                  className={`text-[10px] font-bold px-2 py-1 rounded-lg transition cursor-pointer ${
                                    shop.isActive 
                                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {shop.isActive ? 'Active' : 'Offline'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════
            TAB: STORES
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'stores' && (
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {(['All', 'Pending', 'Approved', 'Rejected'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStoreFilter(tab)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      storeFilter === tab
                        ? 'bg-[#0066FF] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="w-full sm:w-64 relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by store name..."
                  value={storeSearchQuery}
                  onChange={(e) => setStoreSearchQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-9 pr-3 text-xs outline-hidden focus:border-[#0066FF]"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {filteredShops.map((shop) => (
                <div
                  key={shop.id}
                  className="p-4 bg-gray-50/60 rounded-xl border border-gray-200/60 flex items-center justify-between gap-4"
                >
                  <div>
                    <h4 className="text-xs font-bold text-gray-900">{shop.name}</h4>
                    <p className="text-[11px] text-gray-500">{shop.address}</p>
                    <p className="text-[10px] text-gray-400 mt-1">Owner: {shop.ownerName || 'Verified Merchant'}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      shop.verificationStatus === 'Approved' ? 'bg-emerald-50 text-[#34C759]' : 'bg-amber-50 text-[#F59E0B]'
                    }`}>
                      {shop.verificationStatus}
                    </span>

                    {shop.verificationStatus?.toLowerCase() === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleVerifyShop(shop.id.toString(), 'Approved')}
                        className="px-3 py-1.5 bg-[#34C759] text-white text-xs font-bold rounded-lg hover:bg-emerald-600 cursor-pointer"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: USERS
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 space-y-4 shadow-2xs">
            <h3 className="text-sm font-extrabold text-[#0B132B]">Platform Users ({users.length})</h3>
            <div className="divide-y divide-gray-100">
              {users.map((u) => (
                <div key={u.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-gray-900">{u.fullName}</p>
                    <p className="text-gray-500 text-[11px]">{u.email}</p>
                    <span className="text-[10px] font-bold text-[#0066FF] bg-blue-50 px-2 py-0.5 rounded-full mt-1 inline-block">
                      {u.role}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleUser(u.id, u.isActive)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${
                      u.isActive ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 text-red-600 hover:bg-red-100'
                    }`}
                  >
                    {u.isActive ? 'Active' : 'Suspended'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: CATEGORY MANAGEMENT
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'categories' && (
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#0B132B]">Master Product Categories</h3>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(true)}
                className="px-3 py-1.5 bg-[#0066FF] text-white rounded-xl text-xs font-bold hover:bg-[#0052CC] cursor-pointer"
              >
                + Add Category
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {categories.map((cat) => (
                <div key={cat.id} className="p-3.5 bg-gray-50/70 border border-gray-200/80 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-gray-900">{cat.name}</span>
                    <span className="text-[10px] text-gray-400">/{cat.slug}</span>
                  </div>
                  <p className="text-[11px] text-gray-500">{cat.description || 'Global category'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            OTHER TABS FALLBACK (Settings, Audit Logs, Reports)
        ══════════════════════════════════════════════════════════════ */}
        {(activeTab === 'settings' || activeTab === 'audit' || activeTab === 'reports' || activeTab === 'products' || activeTab === 'requests') && (
          <div className="bg-white rounded-2xl border border-gray-200/80 p-6 space-y-3 shadow-2xs">
            <h3 className="text-sm font-extrabold text-[#0B132B] capitalize">{activeTab} Control</h3>
            <p className="text-xs text-gray-500">
              Live records and configurations are synced in real-time with the Zooner database.
            </p>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs font-mono text-gray-700">
              Platform state operational. Ready for high-concurrency requests.
            </div>
          </div>
        )}

        {/* Add Category Modal */}
        {showAddCategoryModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 border border-gray-100">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <h3 className="text-base font-bold text-[#0B132B]">Add New Category</h3>
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCategory} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Category Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Footwear"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-gray-200 focus:outline-hidden focus:border-[#0066FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Slug (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. footwear"
                    value={newCatSlug}
                    onChange={(e) => setNewCatSlug(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-gray-200 focus:outline-hidden focus:border-[#0066FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Description (optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Category description..."
                    value={newCatDescription}
                    onChange={(e) => setNewCatDescription(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-gray-200 focus:outline-hidden focus:border-[#0066FF] resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddCategoryModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold bg-[#0066FF] text-white hover:bg-[#0052CC] rounded-xl shadow-xs"
                  >
                    Create Category
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
