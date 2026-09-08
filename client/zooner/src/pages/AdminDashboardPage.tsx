import React, { useState, useEffect } from 'react';
import {
  Shield,
  Store,
  Users,
  Grid,
  Settings,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft,
  RefreshCw,
  Plus,
  LogOut,
  MapPin,
  Phone
} from 'lucide-react';
import {
  getPendingShops,
  verifyShop,
  fetchCategories,
  createAdminCategory,
  toggleAdminCategoryStatus,
  getAdminUsers,
  toggleUserStatus,
  getAdminSettings,
  updateAdminSetting,
  getAdminAuditLogs,
  logoutUser,
  loginUser,
  syncUserProfile,
  type PendingShopDto,
  type AdminUserDto,
  type AdminSettingDto,
  type AdminAuditLogDto
} from '../services/api';
import type { CategoryDto } from '../types';

interface AdminDashboardProps {
  onSwitchToCustomer: () => void;
  onSwitchToVendor?: () => void;
}

type AdminTab = 'verifications' | 'categories' | 'users' | 'settings' | 'audit';

export const AdminDashboardPage: React.FC<AdminDashboardProps> = ({
  onSwitchToCustomer,
  onSwitchToVendor
}) => {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('zooner_user_profile');
      if (!stored) return false;
      const parsed = JSON.parse(stored);
      const isSuperAdminEmail = ['surya50502001@gmail.com', 'admin@zooner.app'].includes(parsed?.email?.toLowerCase());
      return parsed?.role?.toLowerCase() === 'admin' || isSuperAdminEmail;
    } catch {
      return false;
    }
  });

  const [adminLoginEmail, setAdminLoginEmail] = useState('');
  const [adminLoginPassword, setAdminLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState<AdminTab>('verifications');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // State for data
  const [pendingShops, setPendingShops] = useState<PendingShopDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [settings, setSettings] = useState<AdminSettingDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogDto[]>([]);

  // New Category Form Modal
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatSlug, setNewCatSlug] = useState('');
  const [newCatDescription, setNewCatDescription] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📦');

  // Edit Setting State
  const [editingSettingKey, setEditingSettingKey] = useState<string | null>(null);
  const [settingEditValue, setSettingEditValue] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = async () => {
    if (!isAdminAuthenticated) return;
    setIsLoading(true);
    try {
      if (activeTab === 'verifications') {
        const data = await getPendingShops();
        setPendingShops(data);
      } else if (activeTab === 'categories') {
        const data = await fetchCategories();
        setCategories(data);
      } else if (activeTab === 'users') {
        const data = await getAdminUsers(1, 100);
        setUsers(data);
      } else if (activeTab === 'settings') {
        const data = await getAdminSettings();
        setSettings(data);
      } else if (activeTab === 'audit') {
        const data = await getAdminAuditLogs(1, 100);
        setAuditLogs(data);
      }
    } catch (err) {
      console.error(err);
      showToast('Error fetching admin data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('zooner_token');
        if (!token) return;
        const profile = await syncUserProfile();
        const isSuperAdmin = ['surya50502001@gmail.com', 'admin@zooner.app'].includes(profile?.email?.toLowerCase() || '') || profile?.role?.toLowerCase() === 'admin';
        if (isMounted && isSuperAdmin) {
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
  }, [activeTab, isAdminAuthenticated]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    try {
      const res = await loginUser(adminLoginEmail.trim(), adminLoginPassword);
      if (res.success && res.data) {
        const profile = await syncUserProfile();
        const role = profile?.role || res.data.user.role;
        if (role?.toLowerCase() === 'admin') {
          setIsAdminAuthenticated(true);
          showToast('Administrator authenticated successfully.');
        } else {
          setLoginError('Access denied: this account does not have Administrator role.');
        }
      } else {
        setLoginError(res.error || 'Invalid administrator email or password.');
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Failed to connect to authentication server.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVerifyShop = async (shopId: string, status: 'Approved' | 'Rejected') => {
    const success = await verifyShop(shopId, status);
    if (success) {
      showToast(`Store ${status.toLowerCase()} successfully.`);
      setPendingShops(prev => prev.filter(s => s.id !== shopId));
    } else {
      showToast(`Failed to update store verification status.`);
    }
  };

  const handleToggleCategory = async (catId: string, currentStatus: boolean) => {
    const success = await toggleAdminCategoryStatus(catId, !currentStatus);
    if (success) {
      showToast('Category status updated.');
      setCategories(prev =>
        prev.map(c => (c.id === catId ? { ...c, isActive: !currentStatus } : c))
      );
    } else {
      showToast('Failed to toggle category status.');
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const slug = newCatSlug.trim() || newCatName.trim().toLowerCase().replace(/\s+/g, '-');
    const success = await createAdminCategory({
      name: newCatName.trim(),
      slug,
      description: newCatDescription.trim(),
      icon: newCatIcon.trim()
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

  const handleSaveSetting = async (key: string) => {
    const success = await updateAdminSetting(key, settingEditValue);
    if (success) {
      showToast('Setting updated successfully.');
      setEditingSettingKey(null);
      setSettings(prev =>
        prev.map(s => (s.key === key ? { ...s, value: settingEditValue } : s))
      );
    } else {
      showToast('Failed to update setting.');
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

  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-indigo-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-3">
            <CheckCircle className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        )}

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-indigo-950/80 border border-indigo-800/80 rounded-2xl flex items-center justify-center mx-auto text-indigo-400">
              <Shield className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold font-['Outfit'] tracking-tight">Admin Control Panel</h2>
            <p className="text-xs text-slate-400">
              Administrator privileges required. Enter your admin credentials to access system controls.
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-red-950/50 border border-red-800/50 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Admin Email</label>
              <input
                type="email"
                required
                placeholder="admin@zooner.app"
                value={adminLoginEmail}
                onChange={e => setAdminLoginEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={adminLoginPassword}
                onChange={e => setAdminLoginPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-hidden focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition disabled:opacity-60 cursor-pointer"
            >
              {isLoggingIn ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Authenticate as Admin</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <button
              type="button"
              onClick={onSwitchToCustomer}
              className="hover:text-white transition flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </button>
            {onSwitchToVendor && (
              <button
                type="button"
                onClick={onSwitchToVendor}
                className="hover:text-indigo-400 transition cursor-pointer"
              >
                <span>Merchant Dashboard →</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-indigo-600 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-3">
          <CheckCircle className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight">Zooner Control Panel</h1>
              <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">
                Super Admin
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Physical Shelf Platform Administration</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onSwitchToCustomer}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-700 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Shopper App</span>
          </button>

          {onSwitchToVendor && (
            <button
              type="button"
              onClick={onSwitchToVendor}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-700 transition cursor-pointer"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Merchant OS</span>
            </button>
          )}

          <div className="h-5 w-px bg-slate-800 mx-1" />

          <button
            type="button"
            onClick={() => {
              logoutUser();
              onSwitchToCustomer();
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-xl border border-rose-500/20 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto p-4 md:p-6 gap-6">
        {/* Sidebar Nav */}
        <aside className="w-full md:w-60 shrink-0 space-y-1">
          <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800/80 mb-4 text-xs space-y-1">
            <p className="text-slate-400">Signed in as:</p>
            <p className="font-bold text-white truncate">{userProfile?.name || 'Administrator'}</p>
            <p className="text-[11px] text-indigo-400 font-mono truncate">{userProfile?.email || 'admin@zooner.app'}</p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('verifications')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'verifications'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Store className="w-4 h-4" />
              <span>Store Approvals</span>
            </div>
            {pendingShops.length > 0 && (
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-500/30">
                {pendingShops.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'categories'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Master Categories</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'users'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Accounts</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Platform Settings</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Audit Trail</span>
          </button>
        </aside>

        {/* Content Body */}
        <main className="flex-1 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-5 md:p-6 overflow-hidden">
          {/* Top Action Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {activeTab === 'verifications' && 'Pending Retailer Store Approvals'}
                {activeTab === 'categories' && 'Master Catalog Categories'}
                {activeTab === 'users' && 'Registered Users & Capabilities'}
                {activeTab === 'settings' && 'Global Business Parameters'}
                {activeTab === 'audit' && 'Administrative Audit Logs'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeTab === 'verifications' && 'Review and approve local storefronts before they appear on the discovery map.'}
                {activeTab === 'categories' && 'Manage high-level store categories used for nearby inventory filtering.'}
                {activeTab === 'users' && 'Manage shopper and merchant identities and account access states.'}
                {activeTab === 'settings' && 'Configure search radius limits and live request expiration timeouts.'}
                {activeTab === 'audit' && 'Security log of verified admin operations.'}
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={loadData}
                disabled={isLoading}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer border border-slate-700"
                title="Refresh Data"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
              </button>

              {activeTab === 'categories' && (
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl transition cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Category</span>
                </button>
              )}
            </div>
          </div>

          {/* TAB 1: STORE APPROVALS */}
          {activeTab === 'verifications' && (
            <div>
              {pendingShops.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <CheckCircle className="w-10 h-10 text-emerald-400/80 mx-auto" />
                  <p className="text-sm font-semibold text-white">Verification Queue Clean</p>
                  <p className="text-xs text-slate-400">All registered physical stores have been processed.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {pendingShops.map(shop => (
                    <div
                      key={shop.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white truncate">{shop.name}</h4>
                          <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                            Pending Review
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span>{shop.address || 'No address provided'}</span>
                          </div>
                          {shop.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-slate-500" />
                              <span>{shop.phone}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>Registered: {new Date(shop.createdAtUtc).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {shop.ownerName && (
                          <p className="text-[11px] text-indigo-400">Owner: {shop.ownerName}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleVerifyShop(shop.id, 'Approved')}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl transition cursor-pointer shadow-md shadow-emerald-600/20"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approve Store</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVerifyShop(shop.id, 'Rejected')}
                          className="flex items-center gap-1.5 text-xs font-semibold bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 px-3 py-2 rounded-xl transition cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CATEGORIES */}
          {activeTab === 'categories' && (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {categories.map(cat => (
                  <div
                    key={cat.id}
                    className={`bg-slate-900 border rounded-2xl p-4 flex items-center justify-between transition ${
                      cat.isActive ? 'border-slate-800' : 'border-rose-900/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-lg shrink-0">
                        {cat.iconName || '📦'}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{cat.name}</h4>
                        <p className="text-[11px] text-slate-400 font-mono truncate">{cat.slug}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleCategory(cat.id, cat.isActive)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                        cat.isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                      }`}
                    >
                      {cat.isActive ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: USERS */}
          {activeTab === 'users' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Joined</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{u.fullName || 'User'}</div>
                        <div className="text-[11px] text-slate-400">{u.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block font-bold text-[10px] px-2 py-0.5 rounded-full ${
                            u.role === 'Admin'
                              ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                              : u.role === 'Vendor' || u.role === 'ShopOwner'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[11px] font-medium ${u.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {u.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-400">
                        {new Date(u.createdAtUtc).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {u.role !== 'Admin' && (
                          <button
                            type="button"
                            onClick={() => handleToggleUser(u.id, u.isActive)}
                            className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                              u.isActive
                                ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                            }`}
                          >
                            {u.isActive ? 'Suspend' : 'Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: PLATFORM SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-4 max-w-2xl">
              {settings.map(setting => (
                <div
                  key={setting.key}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white font-mono">{setting.key}</h4>
                      <p className="text-[11px] text-slate-400">{setting.description || 'System setting'}</p>
                    </div>

                    {editingSettingKey === setting.key ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveSetting(setting.key)}
                          className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSettingKey(null)}
                          className="text-xs font-semibold bg-slate-800 text-slate-400 px-2.5 py-1 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSettingKey(setting.key);
                          setSettingEditValue(setting.value);
                        }}
                        className="text-xs font-semibold text-indigo-400 hover:underline"
                      >
                        Edit Value
                      </button>
                    )}
                  </div>

                  {editingSettingKey === setting.key ? (
                    <input
                      type="text"
                      value={settingEditValue}
                      onChange={e => setSettingEditValue(e.target.value)}
                      className="w-full bg-slate-950 border border-indigo-500 rounded-xl px-3 py-2 text-xs text-white outline-hidden"
                    />
                  ) : (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-indigo-300">
                      {setting.value}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 5: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="overflow-x-auto">
              {auditLogs.length === 0 ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <FileText className="w-9 h-9 mx-auto text-slate-500" />
                  <p className="text-xs font-medium">No recent audit entries.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Target Entity</th>
                      <th className="py-3 px-4">Admin</th>
                      <th className="py-3 px-4">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-3 px-4 font-semibold text-white">{log.action}</td>
                        <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{log.entityType} ({log.entityId || 'Global'})</td>
                        <td className="py-3 px-4 text-indigo-400">{log.adminEmail || 'Admin'}</td>
                        <td className="py-3 px-4 text-[11px] text-slate-400">{new Date(log.createdAtUtc).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </main>
      </div>

      {/* New Category Modal */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Create Master Category</h3>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sports & Fitness"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Slug (URL identifier)</label>
                <input
                  type="text"
                  placeholder="e.g. sports-fitness"
                  value={newCatSlug}
                  onChange={e => setNewCatSlug(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-hidden focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Icon / Emoji</label>
                <input
                  type="text"
                  placeholder="e.g. ⚽ or shoe"
                  value={newCatIcon}
                  onChange={e => setNewCatIcon(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  placeholder="Brief description of items under this category"
                  value={newCatDescription}
                  onChange={e => setNewCatDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-hidden focus:border-indigo-500 h-20 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20"
                >
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
