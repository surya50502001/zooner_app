import React, { useState, useEffect, useRef } from 'react';
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
  Phone,
  Search,
  Building2,
  Mail,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import {
  getAdminShops,
  verifyShop,
  toggleAdminShopStatus,
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
  googleLogin,
  syncUserProfile,
  type PendingShopDto,
  type AdminUserDto,
  type AdminSettingDto,
  type AdminAuditLogDto
} from '../services/api';
import type { CategoryDto } from '../types';
import { ExperienceHeaderPill } from '../components/ExperienceSwitcher';

interface AdminDashboardProps {
  onSwitchToCustomer: () => void;
  onSwitchToVendor?: () => void;
  onOpenExperienceSwitcher?: () => void;
  isMultiRole?: boolean;
}

type AdminTab = 'verifications' | 'categories' | 'users' | 'settings' | 'audit';

export const AdminDashboardPage: React.FC<AdminDashboardProps> = ({
  onSwitchToCustomer,
  onSwitchToVendor,
  onOpenExperienceSwitcher,
  isMultiRole,
}) => {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('zooner_user_profile');
      if (!stored) return false;
      const parsed = JSON.parse(stored);
      const isSuperAdmin = ['lpycho3@gmail.com', 'admin@zooner.app'].includes(parsed?.email?.toLowerCase() || '') || parsed?.role?.toLowerCase() === 'admin';
      return Boolean(isSuperAdmin);
    } catch {
      return false;
    }
  });

  const [adminLoginEmail, setAdminLoginEmail] = useState('');
  const [adminLoginPassword, setAdminLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const googleAdminBtnRef = useRef<HTMLDivElement>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  const [activeTab, setActiveTab] = useState<AdminTab>('verifications');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // State for data
  const [allShops, setAllShops] = useState<PendingShopDto[]>([]);
  const [pendingShops, setPendingShops] = useState<PendingShopDto[]>([]);
  const [storeFilter, setStoreFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('Pending');
  const [storeSearchQuery, setStoreSearchQuery] = useState('');
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

  const loadData = async (silent = false) => {
    if (!isAdminAuthenticated) return;
    if (!silent) setIsLoading(true);
    try {
      if (activeTab === 'verifications') {
        const data = await getAdminShops();
        setAllShops(data);
        const pendings = data.filter(s => s.verificationStatus?.toLowerCase() === 'pending');
        setPendingShops(pendings);
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
      if (!silent) {
        console.error(err);
        showToast('Error syncing admin records.');
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
        const isSuperAdmin = ['lpycho3@gmail.com', 'admin@zooner.app'].includes(profile?.email?.toLowerCase() || '') || profile?.role?.toLowerCase() === 'admin';
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

  // Real-time polling every 8s for live store approvals & updates
  useEffect(() => {
    if (!isAdminAuthenticated) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [isAdminAuthenticated, activeTab]);

  const handleGoogleAdminAuth = async (response: google.accounts.id.CredentialResponse) => {
    if (!response.credential) {
      setLoginError('No credential received from Google.');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const authRes = await googleLogin(response.credential);
      if (authRes.success && authRes.data) {
        const profile = await syncUserProfile();
        const email = (profile?.email || authRes.data.user.email || '').toLowerCase();
        const role = profile?.role || authRes.data.user.role;
        const isSuperAdmin = ['lpycho3@gmail.com', 'admin@zooner.app'].includes(email) || role?.toLowerCase() === 'admin';
        if (isSuperAdmin) {
          setIsAdminAuthenticated(true);
          showToast('Administrator authenticated successfully.');
        } else {
          setLoginError('Access denied: this Google account does not have Administrator privileges.');
        }
      } else {
        setLoginError(authRes.error || 'Google sign-in failed.');
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Google sign-in failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    if (isAdminAuthenticated || !googleClientId || !googleAdminBtnRef.current) return;
    let isMounted = true;
    const initGsi = () => {
      if (!isMounted || !googleAdminBtnRef.current || !window.google?.accounts?.id) return;
      try {
        googleAdminBtnRef.current.innerHTML = '';
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleAdminAuth,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(googleAdminBtnRef.current, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          shape: 'pill',
          text: 'signin_with',
          width: 320
        });
      } catch {}
    };
    initGsi();
    return () => { isMounted = false; };
  }, [isAdminAuthenticated, googleClientId]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    try {
      const res = await loginUser(adminLoginEmail.trim(), adminLoginPassword);
      if (res.success && res.data) {
        const profile = await syncUserProfile();
        const email = (profile?.email || res.data.user.email || '').toLowerCase();
        const role = profile?.role || res.data.user.role;
        const isSuperAdmin = ['lpycho3@gmail.com', 'admin@zooner.app'].includes(email) || role?.toLowerCase() === 'admin';
        if (isSuperAdmin) {
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
      showToast(`Storefront ${status.toLowerCase()} successfully.`);
      setAllShops(prev =>
        prev.map(s => (s.id === shopId ? { ...s, verificationStatus: status, isActive: status === 'Approved' ? true : s.isActive } : s))
      );
      setPendingShops(prev => prev.filter(s => s.id !== shopId));
      try {
        const fresh = await getAdminShops();
        setAllShops(fresh);
        setPendingShops(fresh.filter(s => s.verificationStatus?.toLowerCase() === 'pending'));
      } catch {}
    } else {
      showToast('Failed to update store verification status.');
    }
  };

  const handleToggleShopStatus = async (shopId: string, currentActive: boolean) => {
    const success = await toggleAdminShopStatus(shopId, !currentActive);
    if (success) {
      showToast(`Store ${!currentActive ? 'activated' : 'suspended'} successfully.`);
      setAllShops(prev =>
        prev.map(s => (s.id === shopId ? { ...s, isActive: !currentActive } : s))
      );
    } else {
      showToast('Failed to update store status.');
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
      <div className="min-h-screen bg-[#F5F5F7] text-gray-950 flex items-center justify-center p-4 font-apple selection:bg-[#007AFF] selection:text-white">
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-[#1D1D1F] text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-3">
            <CheckCircle className="w-4 h-4 text-[#34C759]" />
            <span>{toastMessage}</span>
          </div>
        )}

        <div className="w-full max-w-md bg-white border border-gray-200/80 rounded-[28px] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)] space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mx-auto text-[#007AFF]">
              <Shield className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-gray-950">Admin Control Panel</h2>
            <p className="text-xs text-gray-500 leading-relaxed max-w-xs mx-auto">
              Administrator privileges required. Sign in with your verified Super Admin credentials to review store applications.
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-[#FF3B30] flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-[#FF3B30]" />
              <span>{loginError}</span>
            </div>
          )}

          {googleClientId && (
            <div className="space-y-3">
              <div ref={googleAdminBtnRef} className="flex justify-center w-full overflow-hidden rounded-xl" />
              <div className="flex items-center gap-3">
                <div className="h-[0.5px] bg-gray-200 flex-1" />
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">or email sign in</span>
                <div className="h-[0.5px] bg-gray-200 flex-1" />
              </div>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Admin Email</label>
              <input
                type="email"
                required
                placeholder="admin@zooner.app"
                value={adminLoginEmail}
                onChange={e => setAdminLoginEmail(e.target.value)}
                className="w-full bg-[#F5F5F7] border-0 rounded-xl px-3.5 py-2.5 text-xs text-gray-950 placeholder-gray-400 outline-hidden focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={adminLoginPassword}
                onChange={e => setAdminLoginPassword(e.target.value)}
                className="w-full bg-[#F5F5F7] border-0 rounded-xl px-3.5 py-2.5 text-xs text-gray-950 placeholder-gray-400 outline-hidden focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-[#007AFF] hover:bg-[#0071E3] text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer shadow-xs"
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

          <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <button
              type="button"
              onClick={onSwitchToCustomer}
              className="hover:text-gray-950 transition flex items-center gap-1.5 cursor-pointer font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </button>
            {onSwitchToVendor && (
              <button
                type="button"
                onClick={onSwitchToVendor}
                className="hover:text-[#007AFF] transition cursor-pointer font-medium"
              >
                <span>Merchant Portal →</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

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
      shop.phone?.toLowerCase().includes(q) ||
      shop.ownerName?.toLowerCase().includes(q) ||
      (shop.ownerEmail && shop.ownerEmail.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-gray-950 flex flex-col font-apple selection:bg-[#007AFF] selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#1D1D1F] text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-3">
          <CheckCircle className="w-4 h-4 text-[#34C759]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Apple Clean Header */}
      <header className="border-b border-gray-200/80 bg-white/90 backdrop-blur-xl sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between shadow-[0_0.5px_0_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#007AFF] border border-blue-100">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-950 tracking-tight">Zooner Control Panel</h1>
              <span className="bg-blue-50 text-[#007AFF] text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100">
                Super Admin
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Physical Shelf Platform Governance & Approvals</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Workspace Switcher for Multi-Role */}
          {isMultiRole && onOpenExperienceSwitcher && (
            <ExperienceHeaderPill currentExperience="admin" onClick={onOpenExperienceSwitcher} />
          )}

          <div className="h-5 w-[0.5px] bg-gray-200 mx-1" />

          <button
            type="button"
            onClick={() => {
              logoutUser();
              onSwitchToCustomer();
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#FF3B30] hover:text-red-700 bg-red-50 hover:bg-red-100/70 px-3 py-1.5 rounded-xl border border-red-100 transition-all active:scale-[0.98] cursor-pointer"
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
          <div className="p-3.5 bg-white rounded-2xl border border-gray-200/80 mb-4 text-xs space-y-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[11px] text-gray-400 font-medium">Logged in Administrator:</p>
            <p className="font-bold text-gray-950 truncate">{userProfile?.name || 'Administrator'}</p>
            <p className="text-[11px] text-[#007AFF] font-mono truncate">{userProfile?.email || 'admin@zooner.app'}</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveTab('verifications');
              setStoreFilter('Pending');
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'verifications'
                ? 'bg-[#007AFF] text-white shadow-sm'
                : 'text-gray-600 hover:bg-white hover:text-gray-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Store className="w-4 h-4" />
              <span>Stores & Approvals</span>
            </div>
            {pendingShops.length > 0 ? (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === 'verifications'
                  ? 'bg-white text-[#007AFF]'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {pendingShops.length}
              </span>
            ) : allShops.length > 0 ? (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === 'verifications' ? 'bg-blue-400/30 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {allShops.length}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeTab === 'categories'
                ? 'bg-[#007AFF] text-white shadow-sm'
                : 'text-gray-600 hover:bg-white hover:text-gray-950'
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
                ? 'bg-[#007AFF] text-white shadow-sm'
                : 'text-gray-600 hover:bg-white hover:text-gray-950'
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
                ? 'bg-[#007AFF] text-white shadow-sm'
                : 'text-gray-600 hover:bg-white hover:text-gray-950'
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
                ? 'bg-[#007AFF] text-white shadow-sm'
                : 'text-gray-600 hover:bg-white hover:text-gray-950'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Audit Trail</span>
          </button>
        </aside>

        {/* Content Body */}
        <main className="flex-1 bg-white border border-gray-200/80 rounded-[28px] p-5 md:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          {/* Top Action Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-bold text-gray-950 tracking-tight">
                {activeTab === 'verifications' && 'Storefronts & Approvals'}
                {activeTab === 'categories' && 'Master Categories'}
                {activeTab === 'users' && 'User Accounts & Access'}
                {activeTab === 'settings' && 'Global Parameters'}
                {activeTab === 'audit' && 'Security Audit Logs'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {activeTab === 'verifications' && 'Audit incoming store registration requests, review physical addresses, and grant Merchant OS access.'}
                {activeTab === 'categories' && 'Manage catalog categories for nearby store inventory filtering.'}
                {activeTab === 'users' && 'Manage shopper and retailer account capabilities.'}
                {activeTab === 'settings' && 'Configure search radiuses, timeouts, and system flags.'}
                {activeTab === 'audit' && 'Audit trail of administrative actions.'}
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => loadData(false)}
                disabled={isLoading}
                className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 transition cursor-pointer border border-gray-200/80 active:scale-95"
                title="Refresh Data"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#007AFF]' : ''}`} />
              </button>

              {activeTab === 'categories' && (
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-[#007AFF] hover:bg-[#0071E3] text-white px-3 py-2 rounded-xl transition-all active:scale-[0.98] cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Category</span>
                </button>
              )}
            </div>
          </div>

          {/* TAB 1: STORES & VERIFICATIONS */}
          {activeTab === 'verifications' && (
            <div className="space-y-5">
              {/* PENDING NOTIFICATION BANNER */}
              {pendingShops.length > 0 && (
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-amber-950">
                        {pendingShops.length} Physical Store Request{pendingShops.length > 1 ? 's' : ''} Awaiting Approval
                      </h4>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        New storefront applications need review before appearing on customer search.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStoreFilter('Pending')}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl transition-all active:scale-95 shrink-0 shadow-xs cursor-pointer"
                  >
                    View Pending Queue
                  </button>
                </div>
              )}

              {/* Summary Metric Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setStoreFilter('Pending')}
                  className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                    storeFilter === 'Pending'
                      ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/20 text-gray-950'
                      : 'bg-gray-50/70 border-gray-200/70 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-amber-700">Pending Review</p>
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <p className="text-xl font-bold mt-1 text-gray-950">
                    {allShops.filter(s => s.verificationStatus?.toLowerCase() === 'pending').length}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setStoreFilter('Approved')}
                  className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                    storeFilter === 'Approved'
                      ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/20 text-gray-950'
                      : 'bg-gray-50/70 border-gray-200/70 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-[#34C759]">Verified Stores</p>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
                  </div>
                  <p className="text-xl font-bold mt-1 text-gray-950">
                    {allShops.filter(s => s.verificationStatus?.toLowerCase() === 'approved').length}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setStoreFilter('All')}
                  className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                    storeFilter === 'All'
                      ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400/20 text-gray-950'
                      : 'bg-gray-50/70 border-gray-200/70 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-[#007AFF]">Total Stores</p>
                    <Store className="w-3.5 h-3.5 text-[#007AFF]" />
                  </div>
                  <p className="text-xl font-bold mt-1 text-gray-950">{allShops.length}</p>
                </button>

                <button
                  type="button"
                  onClick={() => setStoreFilter('Rejected')}
                  className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                    storeFilter === 'Rejected'
                      ? 'bg-red-50 border-red-300 ring-2 ring-red-400/20 text-gray-950'
                      : 'bg-gray-50/70 border-gray-200/70 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-[#FF3B30]">Rejected</p>
                    <XCircle className="w-3.5 h-3.5 text-[#FF3B30]" />
                  </div>
                  <p className="text-xl font-bold mt-1 text-gray-950">
                    {allShops.filter(s => s.verificationStatus?.toLowerCase() === 'rejected').length}
                  </p>
                </button>
              </div>

              {/* Filters and Search Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/80 p-2.5 rounded-2xl border border-gray-200/80">
                <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                  {(['Pending', 'Approved', 'All', 'Rejected'] as const).map(f => {
                    const count = f === 'All' 
                      ? allShops.length 
                      : allShops.filter(s => s.verificationStatus?.toLowerCase() === f.toLowerCase()).length;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setStoreFilter(f)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                          storeFilter === f
                            ? 'bg-white text-gray-950 shadow-xs border border-gray-200/80 font-bold'
                            : 'text-gray-500 hover:text-gray-950'
                        }`}
                      >
                        {f === 'Pending' && `Pending Queue (${count})`}
                        {f === 'Approved' && `Verified (${count})`}
                        {f === 'All' && `All Stores (${count})`}
                        {f === 'Rejected' && `Rejected (${count})`}
                      </button>
                    );
                  })}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={storeSearchQuery}
                    onChange={e => setStoreSearchQuery(e.target.value)}
                    placeholder="Search store, owner, email..."
                    className="w-full bg-white border border-gray-200/80 rounded-xl pl-8.5 pr-3 py-1.5 text-xs text-gray-950 placeholder-gray-400 outline-hidden focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
                  />
                  {storeSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setStoreSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-900 cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Store List */}
              {filteredShops.length === 0 ? (
                <div className="py-16 text-center text-gray-500 space-y-2 bg-gray-50/50 rounded-2xl border border-gray-200/80">
                  <Building2 className="w-10 h-10 text-gray-300 mx-auto" />
                  <p className="text-sm font-semibold text-gray-950">
                    {storeFilter === 'Pending'
                      ? 'No Pending Store Requests'
                      : storeSearchQuery
                      ? 'No stores matching search criteria'
                      : 'No stores found'}
                  </p>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                    {storeFilter === 'Pending'
                      ? 'All storefront registrations have been reviewed. Switch to "All Stores" or "Verified" to inspect registered physical stores.'
                      : storeSearchQuery
                      ? 'Try searching with a different keyword or clear your search query.'
                      : 'No stores currently match the selected filter.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredShops.map(shop => {
                    const isPending = shop.verificationStatus?.toLowerCase() === 'pending';
                    const isApproved = shop.verificationStatus?.toLowerCase() === 'approved';
                    const isRejected = shop.verificationStatus?.toLowerCase() === 'rejected';

                    return (
                      <div
                        key={shop.id}
                        className={`bg-white border rounded-2xl p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${
                          isPending
                            ? 'border-amber-200 bg-amber-50/20 ring-1 ring-amber-300/40'
                            : 'border-gray-200/80 hover:border-gray-300'
                        }`}
                      >
                        <div className="space-y-2 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-gray-950 truncate">{shop.name}</h4>

                            {/* Status Badge */}
                            {isApproved && (
                              <span className="bg-emerald-50 text-[#34C759] text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                <span>Verified & Approved</span>
                              </span>
                            )}
                            {isPending && (
                              <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1 animate-pulse">
                                <Clock className="w-3 h-3 text-amber-700" />
                                <span>Pending Approval</span>
                              </span>
                            )}
                            {isRejected && (
                              <span className="bg-red-50 text-[#FF3B30] text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-100 flex items-center gap-1">
                                <XCircle className="w-3 h-3" />
                                <span>Rejected</span>
                              </span>
                            )}

                            {/* Active/Suspended Badge */}
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                shop.isActive
                                  ? 'bg-gray-100 text-gray-700 border-gray-200'
                                  : 'bg-red-50 text-[#FF3B30] border-red-100'
                              }`}
                            >
                              {shop.isActive ? 'Active' : 'Suspended'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                            <div className="flex items-center gap-1 min-w-0">
                              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="truncate max-w-xs">{shop.address || 'No physical address specified'}</span>
                            </div>
                            {shop.phone && (
                              <div className="flex items-center gap-1 shrink-0">
                                <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span>{shop.phone}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1 shrink-0">
                              <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span>Registered: {new Date(shop.createdAtUtc).toLocaleDateString()}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                            {/* Owner details */}
                            <div className="flex items-center gap-1.5 text-gray-600 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                              <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="font-semibold text-gray-900">
                                Owner: {shop.ownerName || 'User'}
                              </span>
                              {shop.ownerEmail && (
                                <span className="text-gray-500 font-mono text-[10px]">
                                  ({shop.ownerEmail})
                                </span>
                              )}
                            </div>

                            {shop.categories && shop.categories.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {shop.categories.map(c => (
                                  <span
                                    key={c.categoryId || c.name}
                                    className="bg-blue-50/70 text-[#007AFF] px-2 py-0.5 rounded-md text-[10px] font-semibold border border-blue-100"
                                  >
                                    {c.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100">
                          {isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleVerifyShop(shop.id, 'Approved')}
                                className="flex items-center gap-1.5 text-xs font-semibold bg-[#34C759] hover:bg-emerald-600 text-white px-3.5 py-2 rounded-xl transition-all active:scale-[0.98] cursor-pointer shadow-xs"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Approve Store</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleVerifyShop(shop.id, 'Rejected')}
                                className="flex items-center gap-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 text-[#FF3B30] border border-red-200 px-3 py-2 rounded-xl transition-all active:scale-[0.98] cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Decline</span>
                              </button>
                            </>
                          )}

                          {!isPending && !isApproved && (
                            <button
                              type="button"
                              onClick={() => handleVerifyShop(shop.id, 'Approved')}
                              className="flex items-center gap-1.5 text-xs font-semibold bg-[#34C759] hover:bg-emerald-600 text-white px-3 py-1.5 rounded-xl transition-all active:scale-[0.98] cursor-pointer shadow-xs"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Re-Approve</span>
                            </button>
                          )}

                          {!isPending && !isRejected && (
                            <button
                              type="button"
                              onClick={() => handleVerifyShop(shop.id, 'Rejected')}
                              className="flex items-center gap-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 text-[#FF3B30] border border-red-200 px-3 py-1.5 rounded-xl transition-all active:scale-[0.98] cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleToggleShopStatus(shop.id, shop.isActive)}
                            className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all active:scale-[0.98] cursor-pointer ${
                              shop.isActive
                                ? 'bg-gray-100 text-gray-700 hover:text-red-700 hover:bg-red-50 border-gray-200'
                                : 'bg-emerald-50 text-[#34C759] hover:bg-emerald-100 border-emerald-200'
                            }`}
                          >
                            <span>{shop.isActive ? 'Suspend' : 'Activate'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
                    className={`bg-white border rounded-2xl p-4 flex items-center justify-between transition-all shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${
                      cat.isActive ? 'border-gray-200/80' : 'border-red-100 opacity-60 bg-red-50/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg shrink-0">
                        {cat.iconName || '📦'}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-gray-950 truncate">{cat.name}</h4>
                        <p className="text-[11px] text-gray-400 font-mono truncate">{cat.slug}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleCategory(cat.id, cat.isActive)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        cat.isActive
                          ? 'bg-emerald-50 text-[#34C759] border-emerald-100 hover:bg-emerald-100'
                          : 'bg-red-50 text-[#FF3B30] border-red-100 hover:bg-red-100'
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
            <div className="overflow-x-auto rounded-2xl border border-gray-200/80">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50 text-gray-500 font-semibold uppercase text-[10px] border-b border-gray-200/80">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Joined</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50/60 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-950">{u.fullName || 'User'}</div>
                        <div className="text-[11px] text-gray-400">{u.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block font-bold text-[10px] px-2 py-0.5 rounded-full ${
                            u.role === 'Admin'
                              ? 'bg-blue-50 text-[#007AFF] border border-blue-100'
                              : u.role === 'Vendor' || u.role === 'ShopOwner'
                              ? 'bg-emerald-50 text-[#34C759] border border-emerald-100'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[11px] font-medium ${u.isActive ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                          {u.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[11px] text-gray-400">
                        {new Date(u.createdAtUtc).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {u.role !== 'Admin' && (
                          <button
                            type="button"
                            onClick={() => handleToggleUser(u.id, u.isActive)}
                            className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                              u.isActive
                                ? 'bg-red-50 text-[#FF3B30] hover:bg-red-100'
                                : 'bg-emerald-50 text-[#34C759] hover:bg-emerald-100'
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
                  className="bg-white border border-gray-200/80 rounded-2xl p-4 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-gray-950 font-mono">{setting.key}</h4>
                      <p className="text-[11px] text-gray-500">{setting.description || 'System setting'}</p>
                    </div>

                    {editingSettingKey === setting.key ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveSetting(setting.key)}
                          className="text-xs font-semibold bg-[#34C759] hover:bg-emerald-600 text-white px-3 py-1 rounded-lg"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSettingKey(null)}
                          className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg"
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
                        className="text-xs font-semibold text-[#007AFF] hover:underline"
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
                      className="w-full bg-[#F5F5F7] border border-[#007AFF] rounded-xl px-3 py-2 text-xs text-gray-950 outline-hidden"
                    />
                  ) : (
                    <div className="bg-[#F5F5F7] border border-gray-200/80 rounded-xl px-3 py-2 text-xs font-mono text-gray-900">
                      {setting.value}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 5: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="overflow-x-auto rounded-2xl border border-gray-200/80">
              {auditLogs.length === 0 ? (
                <div className="py-16 text-center text-gray-400 space-y-2">
                  <FileText className="w-9 h-9 mx-auto text-gray-300" />
                  <p className="text-xs font-medium">No recent audit entries.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs text-gray-700">
                  <thead className="bg-gray-50 text-gray-500 font-semibold uppercase text-[10px] border-b border-gray-200/80">
                    <tr>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Target Entity</th>
                      <th className="py-3 px-4">Admin</th>
                      <th className="py-3 px-4">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-gray-50/60 transition">
                        <td className="py-3 px-4 font-semibold text-gray-950">{log.action}</td>
                        <td className="py-3 px-4 text-gray-500 font-mono text-[11px]">{log.entityType} ({log.entityId || 'Global'})</td>
                        <td className="py-3 px-4 text-[#007AFF]">{log.adminEmail || 'Admin'}</td>
                        <td className="py-3 px-4 text-[11px] text-gray-400">{new Date(log.createdAtUtc).toLocaleString()}</td>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white border border-gray-200/80 rounded-[28px] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-950">Create Master Category</h3>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="text-gray-400 hover:text-gray-950 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Category Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sports & Fitness"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  className="w-full bg-[#F5F5F7] border-0 rounded-xl px-3 py-2 text-xs text-gray-950 outline-hidden focus:ring-2 focus:ring-[#007AFF]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Slug (URL identifier)</label>
                <input
                  type="text"
                  placeholder="e.g. sports-fitness"
                  value={newCatSlug}
                  onChange={e => setNewCatSlug(e.target.value)}
                  className="w-full bg-[#F5F5F7] border-0 rounded-xl px-3 py-2 text-xs text-gray-950 outline-hidden focus:ring-2 focus:ring-[#007AFF]/20 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Icon / Emoji</label>
                <input
                  type="text"
                  placeholder="e.g. ⚽ or shoe"
                  value={newCatIcon}
                  onChange={e => setNewCatIcon(e.target.value)}
                  className="w-full bg-[#F5F5F7] border-0 rounded-xl px-3 py-2 text-xs text-gray-950 outline-hidden focus:ring-2 focus:ring-[#007AFF]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
                <textarea
                  placeholder="Brief description of items under this category"
                  value={newCatDescription}
                  onChange={e => setNewCatDescription(e.target.value)}
                  className="w-full bg-[#F5F5F7] border-0 rounded-xl px-3 py-2 text-xs text-gray-950 outline-hidden focus:ring-2 focus:ring-[#007AFF]/20 h-20 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#007AFF] hover:bg-[#0071E3] text-white shadow-xs cursor-pointer active:scale-95"
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

