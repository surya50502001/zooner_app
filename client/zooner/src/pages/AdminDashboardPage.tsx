import React, { useState } from 'react';
import {
  Shield,
  Store,
  Users,
  Settings,
  CheckCircle,
  LogOut,
  Search,
  CheckCircle2,
  TrendingUp,
  BarChart3,
  Sparkles
} from 'lucide-react';
import {
  loginUser,
  type PendingShopDto,
  type AdminUserDto
} from '../services/api';
import { ExperienceHeaderPill } from '../components/ExperienceSwitcher';

interface AdminDashboardProps {
  onSwitchToCustomer: () => void;
  onSwitchToVendor?: () => void;
  onOpenExperienceSwitcher?: () => void;
  isMultiRole?: boolean;
}

export type AdminTab = 'overview' | 'users' | 'stores' | 'reports' | 'settings';

const MOCK_USERS: AdminUserDto[] = [
  { id: 'u-1', fullName: 'John Doe', email: 'john.doe@example.com', role: 'Customer', isActive: true, createdAtUtc: '2026-09-28T00:00:00Z' },
  { id: 'u-2', fullName: 'Priya Sundaram', email: 'priya.s@example.com', role: 'Customer', isActive: true, createdAtUtc: '2026-09-27T00:00:00Z' },
  { id: 'u-3', fullName: 'TechWorld Store Manager', email: 'techworld.cbe@zooner.app', role: 'Vendor', isActive: true, createdAtUtc: '2026-09-20T00:00:00Z' },
  { id: 'u-4', fullName: 'StyleHub Manager', email: 'stylehub.cbe@zooner.app', role: 'Vendor', isActive: true, createdAtUtc: '2026-09-15T00:00:00Z' },
  { id: 'u-5', fullName: 'Karthik Raja', email: 'karthik.r@example.com', role: 'Customer', isActive: true, createdAtUtc: '2026-09-12T00:00:00Z' },
  { id: 'u-6', fullName: 'Platform Admin', email: 'admin@zooner.app', role: 'Admin', isActive: true, createdAtUtc: '2026-09-01T00:00:00Z' }
];

const MOCK_STORES: PendingShopDto[] = [
  {
    id: 'store-1',
    name: 'TechWorld Coimbatore',
    ownerEmail: 'techworld.cbe@zooner.app',
    ownerName: 'Ramesh Krishnan',
    ownerId: 'own-1',
    address: '104, DB Road, RS Puram, Coimbatore',
    phone: '+91 98430 11223',
    latitude: 11.0168,
    longitude: 76.9558,
    verificationStatus: 'Approved',
    isActive: true,
    createdAtUtc: '2026-09-20T00:00:00Z',
    categories: [{ categoryId: 'c1', name: 'Electronics & Gadgets' }]
  },
  {
    id: 'store-2',
    name: 'StyleHub Premier',
    ownerEmail: 'stylehub.cbe@zooner.app',
    ownerName: 'Kavitha S',
    ownerId: 'own-2',
    address: '45, Cross Cut Road, Gandhipuram',
    phone: '+91 98432 99887',
    latitude: 11.0188,
    longitude: 76.9658,
    verificationStatus: 'Approved',
    isActive: true,
    createdAtUtc: '2026-09-15T00:00:00Z',
    categories: [{ categoryId: 'c2', name: 'Fashion & Footwear' }]
  },
  {
    id: 'store-3',
    name: 'Glow Studio Beauty Care',
    ownerEmail: 'glow.cbe@zooner.app',
    ownerName: 'Deepa M',
    ownerId: 'own-3',
    address: '12, Race Course Road, Coimbatore',
    phone: '+91 97890 33221',
    latitude: 11.0128,
    longitude: 76.9758,
    verificationStatus: 'Pending',
    isActive: false,
    createdAtUtc: '2026-09-28T00:00:00Z',
    categories: [{ categoryId: 'c3', name: 'Beauty & Personal Care' }]
  },
  {
    id: 'store-4',
    name: 'Urban Living Furnishings',
    ownerEmail: 'urban.cbe@zooner.app',
    ownerName: 'Saravanan B',
    ownerId: 'own-4',
    address: '88, Avinashi Road, Peelamedu',
    phone: '+91 98421 55443',
    latitude: 11.0258,
    longitude: 76.9858,
    verificationStatus: 'Pending',
    isActive: false,
    createdAtUtc: '2026-09-27T00:00:00Z',
    categories: [{ categoryId: 'c4', name: 'Home & Living' }]
  }
];

export const AdminDashboardPage: React.FC<AdminDashboardProps> = ({
  onSwitchToCustomer: _onSwitchToCustomer,
  onSwitchToVendor: _onSwitchToVendor,
  onOpenExperienceSwitcher,
  isMultiRole: _isMultiRole,
}) => {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('zooner_admin_token') || localStorage.getItem('zooner_admin_demo'));
  });

  const [adminLoginEmail, setAdminLoginEmail] = useState('');
  const [adminLoginPassword, setAdminLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [stores, setStores] = useState<PendingShopDto[]>(MOCK_STORES);
  const [users, setUsers] = useState<AdminUserDto[]>(MOCK_USERS);
  const [userFilter, setUserFilter] = useState<'all' | 'customer' | 'vendor'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState<'all' | 'approved' | 'pending'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1-Click Demo Login
  const handleQuickDemoAdmin = () => {
    localStorage.setItem('zooner_admin_demo', 'true');
    setIsAdminAuthenticated(true);
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await loginUser(adminLoginEmail, adminLoginPassword);
      if (res.success && res.data?.accessToken) {
        localStorage.setItem('zooner_admin_token', res.data.accessToken);
        setIsAdminAuthenticated(true);
      } else {
        setLoginError(res.error || 'Invalid administrator credentials');
      }
    } catch {
      handleQuickDemoAdmin();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('zooner_admin_token');
    localStorage.removeItem('zooner_admin_demo');
    setIsAdminAuthenticated(false);
  };

  const handleApproveStore = (storeId: string) => {
    setStores(prev => prev.map(s => s.id === storeId ? { ...s, verificationStatus: 'Approved', isActive: true } : s));
    showToast('Store approved and activated on physical shelves!');
  };

  const handleRejectStore = (storeId: string) => {
    setStores(prev => prev.map(s => s.id === storeId ? { ...s, verificationStatus: 'Rejected', isActive: false } : s));
    showToast('Store application rejected.');
  };

  const handleToggleUser = (userId: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !u.isActive } : u));
    showToast('User status updated.');
  };

  // Filtered Users
  const filteredUsers = users.filter(u => {
    if (userFilter === 'customer' && u.role?.toLowerCase() !== 'customer') return false;
    if (userFilter === 'vendor' && u.role?.toLowerCase() !== 'vendor') return false;
    if (userSearch && !u.fullName.toLowerCase().includes(userSearch.toLowerCase()) && !u.email.toLowerCase().includes(userSearch.toLowerCase())) return false;
    return true;
  });

  // Filtered Stores
  const filteredStores = stores.filter(s => {
    if (storeFilter === 'approved' && s.verificationStatus?.toLowerCase() !== 'approved') return false;
    if (storeFilter === 'pending' && s.verificationStatus?.toLowerCase() !== 'pending') return false;
    return true;
  });

  // ══════════════════════════════════════════════════════════════════
  // SCREEN 1: ADMIN LOGIN
  // ══════════════════════════════════════════════════════════════════
  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 selection:bg-indigo-500">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/10">
              <Shield className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-black tracking-tight font-['Outfit']">Zooner Admin Console</h2>
            <p className="text-xs text-slate-400">Platform Governance & Physical Store Operations</p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Admin Email</label>
              <input
                type="email"
                value={adminLoginEmail}
                onChange={(e) => setAdminLoginEmail(e.target.value)}
                placeholder="admin@zooner.app"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={adminLoginPassword}
                onChange={(e) => setAdminLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {loginError && (
              <p className="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded-xl border border-rose-800/50">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-2xl text-xs font-bold transition shadow-lg shadow-indigo-600/20 cursor-pointer"
            >
              {isLoggingIn ? 'Authenticating...' : 'Sign In to Admin Control Panel'}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={handleQuickDemoAdmin}
              className="w-full bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Explore Admin Console (1-Click Demo)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-indigo-500 selection:text-white pb-20">
      
      {/* ── TOP ADMIN HEADER ── */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center font-bold">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white">Zooner Platform Governance</h3>
              <span className="text-[9px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800 px-1.5 py-0.2 rounded font-bold">
                ROOT ADMIN
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Coimbatore Marketplace Control</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onOpenExperienceSwitcher && (
            <ExperienceHeaderPill
              currentExperience="admin"
              onClick={onOpenExperienceSwitcher}
            />
          )}

          <button
            onClick={handleLogout}
            className="text-xs text-rose-400 hover:text-rose-300 font-semibold p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── ADMIN NAVIGATION TABS (Overview, Users, Stores, Reports, Settings) ── */}
      <div className="bg-slate-900/60 border-b border-slate-800 px-6 py-2 flex gap-2 overflow-x-auto no-scrollbar text-xs font-bold">
        {[
          { id: 'overview' as AdminTab, label: 'Dashboard Overview', icon: BarChart3 },
          { id: 'users' as AdminTab, label: 'Manage Users (324)', icon: Users },
          { id: 'stores' as AdminTab, label: 'Manage Stores (86)', icon: Store },
          { id: 'reports' as AdminTab, label: 'Financials & GMV', icon: TrendingUp },
          { id: 'settings' as AdminTab, label: 'Platform Settings', icon: Settings }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Toast message banner */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-950 border border-emerald-500/50 text-emerald-300 text-xs px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── MAIN ADMIN WORKSPACE ── */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">

        {/* ══════════════════════════════════════════════════════════════════
            SCREEN 2: ADMIN DASHBOARD (324 Users, 86 Stores, 1245 Prods, 98 Holds)
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* 4 KPI Counter Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm">
                <span className="text-xs text-slate-400 uppercase font-bold">Total Platform Users</span>
                <div className="text-2xl font-black text-white mt-1.5 font-mono">324</div>
                <span className="text-[10px] text-emerald-400 font-bold mt-1 block">+12% this week</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm">
                <span className="text-xs text-slate-400 uppercase font-bold">Registered Stores</span>
                <div className="text-2xl font-black text-indigo-400 mt-1.5 font-mono">86</div>
                <span className="text-[10px] text-amber-400 font-bold mt-1 block">4 Pending Review</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm">
                <span className="text-xs text-slate-400 uppercase font-bold">Catalog Products</span>
                <div className="text-2xl font-black text-white mt-1.5 font-mono">1,245</div>
                <span className="text-[10px] text-slate-400 mt-1 block">Verified Physical Stock</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm">
                <span className="text-xs text-slate-400 uppercase font-bold">Active Holds Right Now</span>
                <div className="text-2xl font-black text-emerald-400 mt-1.5 font-mono">98</div>
                <span className="text-[10px] text-emerald-400 font-bold mt-1 block">30-min window</span>
              </div>
            </div>

            {/* Platform Volume / GMV Sales Trend Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-['Outfit']">
                    Platform Reservation & Gross Value Trend
                  </h3>
                  <p className="text-xs text-slate-400">Total physical marketplace footfall and fulfilled sales</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Total 30-Day GMV</span>
                  <span className="text-lg font-black font-mono text-emerald-400">₹12,45,000</span>
                </div>
              </div>

              {/* Volume Bars */}
              <div className="h-44 flex items-end justify-between gap-4 pt-6 px-4">
                {[
                  { label: 'Week 1', count: 180, gmv: '₹1.8L' },
                  { label: 'Week 2', count: 240, gmv: '₹2.4L' },
                  { label: 'Week 3', count: 390, gmv: '₹3.9L' },
                  { label: 'Week 4', count: 435, gmv: '₹4.3L' }
                ].map((wk, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <span className="text-xs font-mono font-bold text-slate-300">{wk.gmv}</span>
                    <div 
                      style={{ height: `${(wk.count / 450) * 100}%` }}
                      className="w-full max-w-[48px] bg-gradient-to-t from-indigo-600 via-indigo-500 to-emerald-400 rounded-t-xl"
                    />
                    <span className="text-xs font-bold text-slate-400 mt-1">{wk.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* City Breakdown */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-['Outfit']">City Activity Hubs</h3>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Coimbatore (Primary)</span>
                    <span className="text-emerald-400 font-bold font-mono">82 Stores</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">1,050 active catalog products</p>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Chennai</span>
                    <span className="text-indigo-400 font-bold font-mono">Waitlist (140)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Launching Q4</p>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Bangalore</span>
                    <span className="text-indigo-400 font-bold font-mono">Waitlist (210)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Launching Q4</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SCREEN 3: MANAGE USERS (Tabs: All, Customers, Vendors)
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'users' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Header & Filter Controls */}
            <div className="flex flex-col sm:row gap-3 items-center justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => setUserFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    userFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  All (324)
                </button>
                <button
                  onClick={() => setUserFilter('customer')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    userFilter === 'customer' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Customers (238)
                </button>
                <button
                  onClick={() => setUserFilter('vendor')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    userFilter === 'vendor' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  Vendors (86)
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-bold text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-5">User</th>
                    <th className="py-3 px-5">Role</th>
                    <th className="py-3 px-5">Joined</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-850/50 transition">
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-white">{user.fullName}</div>
                        <div className="text-[11px] text-slate-400">{user.email}</div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          user.role === 'Vendor' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                          user.role === 'Admin' ? 'bg-indigo-950 text-indigo-400 border border-indigo-800' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 font-mono text-[11px] text-slate-400">
                        {new Date(user.createdAtUtc).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`text-[10px] font-bold flex items-center gap-1 ${
                          user.isActive ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {user.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={() => handleToggleUser(user.id)}
                          className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                        >
                          {user.isActive ? 'Suspend' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SCREEN 4: MANAGE STORES & VERIFICATIONS
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'stores' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Filter Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setStoreFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  storeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                All Stores ({stores.length})
              </button>
              <button
                onClick={() => setStoreFilter('approved')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  storeFilter === 'approved' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                Active Verified ({stores.filter(s => s.verificationStatus === 'Approved').length})
              </button>
              <button
                onClick={() => setStoreFilter('pending')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  storeFilter === 'pending' ? 'bg-amber-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                Pending Review ({stores.filter(s => s.verificationStatus === 'Pending').length})
              </button>
            </div>

            {/* Store Verification Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredStores.map((store) => (
                <div key={store.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        store.verificationStatus === 'Approved' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                        store.verificationStatus === 'Pending' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                        'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}>
                        {store.verificationStatus}
                      </span>
                      <h4 className="text-base font-bold text-white mt-1.5 font-['Outfit']">{store.name}</h4>
                      <p className="text-xs text-slate-400">{store.categories?.[0]?.name || 'Retail Store'}</p>
                    </div>

                    <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center text-indigo-400 font-bold">
                      <Store className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-2xl space-y-1.5 text-xs text-slate-300">
                    <div>Owner: <strong>{store.ownerName}</strong> ({store.ownerEmail})</div>
                    <div>Address: {store.address}</div>
                    <div>Phone: {store.phone}</div>
                  </div>

                  {store.verificationStatus === 'Pending' ? (
                    <div className="flex gap-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => handleApproveStore(store.id)}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        Approve Store
                      </button>
                      <button
                        onClick={() => handleRejectStore(store.id)}
                        className="flex-1 bg-rose-950 hover:bg-rose-900 text-rose-300 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Live on Zooner Public Shelves</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SCREEN 5: PLATFORM REPORTS & FINANCIALS
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'reports' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
                <span className="text-xs text-slate-400 uppercase font-bold">Total Reservations</span>
                <div className="text-2xl font-black text-white mt-1.5 font-mono">1,245</div>
                <span className="text-[10px] text-emerald-400 font-bold mt-1 block">All Time</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
                <span className="text-xs text-slate-400 uppercase font-bold">Total GMV Value</span>
                <div className="text-2xl font-black text-emerald-400 mt-1.5 font-mono">₹12.4L</div>
                <span className="text-[10px] text-slate-400 mt-1 block">Completed Pickups</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
                <span className="text-xs text-slate-400 uppercase font-bold">Avg Hold Duration</span>
                <div className="text-2xl font-black text-white mt-1.5 font-mono">18.4 min</div>
                <span className="text-[10px] text-slate-400 mt-1 block">Window limit 30 min</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5">
                <span className="text-xs text-slate-400 uppercase font-bold">Conversion Rate</span>
                <div className="text-2xl font-black text-indigo-400 mt-1.5 font-mono">78.2%</div>
                <span className="text-[10px] text-emerald-400 font-bold mt-1 block">Walk-in completion</span>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            SCREEN 6: SYSTEM SETTINGS & GOVERNANCE
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 animate-in fade-in duration-200 text-xs">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-['Outfit']">
              Platform Configuration Parameters
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
                <div>
                  <div className="font-bold text-white">Default Hold Duration</div>
                  <div className="text-slate-400 text-[11px]">Time in minutes a physical inventory hold lasts</div>
                </div>
                <span className="font-mono font-bold text-emerald-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
                  30 minutes
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
                <div>
                  <div className="font-bold text-white">Max Active Holds Per Customer</div>
                  <div className="text-slate-400 text-[11px]">Prevents inventory hoarding by a single user</div>
                </div>
                <span className="font-mono font-bold text-indigo-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
                  1 active hold
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
                <div>
                  <div className="font-bold text-white">Auto-Expiry Worker</div>
                  <div className="text-slate-400 text-[11px]">Automatic release of uncollected holds</div>
                </div>
                <span className="font-bold text-emerald-400 bg-emerald-950 px-3 py-1 rounded-full border border-emerald-800">
                  Active (Interval: 60s)
                </span>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};
