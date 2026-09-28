import React, { useState } from 'react';
import { ShoppingBag, Store, Shield, X, ArrowRight, CheckCircle2, Globe, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import type { AppRoute } from '../App';

interface ExperienceSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  currentExperience: AppRoute;
  onSelectExperience: (experience: AppRoute) => void;
  userProfile?: {
    name?: string;
    email?: string;
    role?: string;
    isVendor?: boolean;
    shops?: any[];
  } | null;
}

export function getUserCapabilities(profile: any) {
  const role = (profile?.role || '').toLowerCase();
  const hasAdminRole = role === 'admin';
  const hasVendorRole = hasAdminRole || 
    role === 'vendor' || 
    role === 'shopowner' || 
    role === 'both' || 
    role === 'vc' || 
    Boolean(profile?.isVendor) || 
    (Array.isArray(profile?.shops) && profile.shops.length > 0);
  
  const isGuest = Boolean(profile?.isGuest || profile?.email?.includes('@guest.zooner.app'));
  const isMultiRole = !isGuest && (
    (hasAdminRole && hasVendorRole) ||
    hasVendorRole
  );

  return {
    canAccessCustomer: true,
    canAccessVendor: true, // Allow seamless exploration
    canAccessAdmin: true,   // Allow seamless exploration
    isMultiRole: Boolean(isMultiRole)
  };
}

export const ExperienceSwitcherModal: React.FC<ExperienceSwitcherProps> = ({
  isOpen,
  onClose,
  currentExperience,
  onSelectExperience,
  userProfile
}) => {
  if (!isOpen) return null;

  const experiences = [
    {
      id: 'customer' as AppRoute,
      title: 'Customer Experience',
      tagline: 'Physical Shelf Discovery & 30-Min Holds',
      description: 'Search local products, check nearby shelf stock in Coimbatore, reserve 30-min hold passes with live QR, and chat with stores.',
      icon: ShoppingBag,
      accentColor: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
      activeBorder: 'border-blue-500 ring-2 ring-blue-500/30',
      badge: '9 Screens'
    },
    {
      id: 'vendor' as AppRoute,
      title: 'Merchant OS (Store Owner)',
      tagline: 'Store Dashboard & Hold Verification',
      description: 'Live inventory stock switches, active holds queue, QR camera scanner overlay, hold fulfillment, and sales analytics.',
      icon: Store,
      accentColor: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
      activeBorder: 'border-emerald-500 ring-2 ring-emerald-500/30',
      badge: '9 Screens'
    },
    {
      id: 'admin' as AppRoute,
      title: 'Admin Control Panel',
      tagline: 'Platform Governance & Master Catalog',
      description: '324 users, 86 stores, verification approval queues, category taxonomy, GMV reports, and system governance.',
      icon: Shield,
      accentColor: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400',
      activeBorder: 'border-indigo-500 ring-2 ring-indigo-500/30',
      badge: '6 Screens'
    },
    {
      id: 'marketing' as AppRoute,
      title: 'Marketing Landing Page',
      tagline: 'Public Brand Presence & Waitlist',
      description: 'High-converting dark landing page with 5-second delayed waitlist popup, interactive map locator, and product journey.',
      icon: Globe,
      accentColor: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
      activeBorder: 'border-purple-500 ring-2 ring-purple-500/30',
      badge: 'Public'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#7C5CFF]" />
              <h3 className="text-lg font-bold tracking-tight font-['Outfit']">Switch Zooner Experience</h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Explore all complete flows from the design mockups</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Experience Cards */}
        <div className="space-y-3">
          {experiences.map((exp) => {
            const Icon = exp.icon;
            const isCurrent = currentExperience === exp.id;

            return (
              <div
                key={exp.id}
                onClick={() => {
                  onSelectExperience(exp.id);
                  onClose();
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  isCurrent
                    ? `${exp.activeBorder} bg-slate-800/90 shadow-lg ring-2`
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${exp.accentColor}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{exp.title}</h4>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {exp.badge}
                        </span>
                        {isCurrent && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium">{exp.tagline}</p>
                    </div>
                  </div>

                  {!isCurrent && (
                    <ArrowRight className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                  )}
                </div>

                <p className="text-xs text-slate-400 mt-2.5 pl-13 leading-relaxed">
                  {exp.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Active Role: <strong className="text-slate-300">{userProfile?.name || 'Explorer'}</strong></span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition cursor-pointer font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export const ExperienceHeaderPill: React.FC<{
  currentExperience: AppRoute;
  onClick: () => void;
}> = ({ currentExperience, onClick }) => {
  const getLabel = () => {
    switch (currentExperience) {
      case 'admin':
        return { label: 'Admin Console', icon: Shield, color: 'border-indigo-500/30 text-indigo-400 bg-indigo-950/70 hover:bg-indigo-900/60' };
      case 'vendor':
        return { label: 'Merchant OS', icon: Store, color: 'border-emerald-500/30 text-[#34C759] bg-emerald-950/70 hover:bg-emerald-900/60' };
      case 'marketing':
        return { label: 'Marketing Page', icon: Globe, color: 'border-purple-500/30 text-purple-400 bg-purple-950/70 hover:bg-purple-900/60' };
      case 'customer':
      default:
        return { label: 'Customer App', icon: ShoppingBag, color: 'border-[#007AFF]/30 text-[#007AFF] bg-[#007AFF]/10 hover:bg-[#007AFF]/20' };
    }
  };

  const { label, icon: Icon, color } = getLabel();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-semibold shadow-xs hover:opacity-90 active:scale-[0.97] transition-all cursor-pointer ${color}`}
      title="Switch Zooner Product Workspace"
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
      <span className="text-[10px] opacity-70">⇄</span>
    </button>
  );
};

/**
 * Global Floating Experience Bar
 * Stays visible across the app allowing instant 1-click preview and navigation
 * between Customer App, Vendor Dashboard, Admin Console, and Landing Page.
 */
export const GlobalExperienceBar: React.FC<{
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}> = ({ currentRoute, onNavigate }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const flows = [
    { id: 'customer' as AppRoute, label: '🛍️ Customer App', subtitle: '9 Screens' },
    { id: 'vendor' as AppRoute, label: '🏪 Vendor OS', subtitle: '9 Screens' },
    { id: 'admin' as AppRoute, label: '⚡ Admin Console', subtitle: '6 Screens' },
    { id: 'marketing' as AppRoute, label: '🌐 Landing Page', subtitle: 'Waitlist' }
  ];

  return (
    <aside 
      aria-label="Experience switcher"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 pointer-events-auto"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl shadow-black/60 rounded-full px-2 py-1.5 flex items-center gap-1.5 text-xs text-white">
        <div className="hidden sm:flex items-center gap-1.5 pl-3 pr-2 text-slate-400 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-[#7C5CFF]" />
          <span className="text-[11px] font-semibold text-slate-300">Flow:</span>
        </div>

        {!isCollapsed && (
          <div className="flex items-center gap-1">
            {flows.map((flow) => {
              const isActive = currentRoute === flow.id;
              return (
                <button
                  key={flow.id}
                  onClick={() => onNavigate(flow.id)}
                  className={`px-3 py-1.5 rounded-full font-medium transition-all text-xs flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-[#7C5CFF] text-white shadow-md font-bold scale-[1.03]'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <span>{flow.label}</span>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-black/25 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {flow.subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer ml-0.5"
          title={isCollapsed ? 'Expand flows switcher' : 'Collapse flows switcher'}
        >
          {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  );
};
