import React from 'react';
import { ShoppingBag, Store, Shield, X, ArrowRight, CheckCircle2 } from 'lucide-react';
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

export function isSuperAdminEmail(email?: string): boolean {
  if (!email) return false;
  return ['lpycho3@gmail.com', 'admin@zooner.app'].includes(email.toLowerCase().trim());
}

export function getUserCapabilities(profile: any) {
  const isSuper = isSuperAdminEmail(profile?.email) || profile?.role?.toLowerCase() === 'admin';
  const hasVendorRole = profile?.isVendor || 
    ['shopowner', 'vendor', 'admin', 'vc', 'both'].includes(profile?.role?.toLowerCase() || '') || 
    (profile?.shops && profile.shops.length > 0) || 
    isSuper;
  
  const hasAdminRole = isSuper || profile?.role?.toLowerCase() === 'admin';
  const isMultiRole = (hasAdminRole && (hasVendorRole || true)) || (hasVendorRole && !profile?.email?.includes('@guest.zooner.app'));

  return {
    canAccessCustomer: true,
    canAccessVendor: Boolean(hasVendorRole),
    canAccessAdmin: Boolean(hasAdminRole),
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

  const caps = getUserCapabilities(userProfile);

  const experiences = [
    {
      id: 'customer' as AppRoute,
      title: 'Customer',
      tagline: 'Physical Shelf Discovery & Holds',
      description: 'Search local products, check nearby shelf stock, and reserve 30-min hold passes.',
      icon: ShoppingBag,
      accentColor: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
      activeBorder: 'border-purple-500 ring-2 ring-purple-500/30',
      enabled: caps.canAccessCustomer,
      route: '#app'
    },
    {
      id: 'vendor' as AppRoute,
      title: 'Merchant Portal',
      tagline: 'Store & Inventory Operations',
      description: 'Manage shelf stock, respond to customer requests, and scan QR passes for collection.',
      icon: Store,
      accentColor: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
      activeBorder: 'border-emerald-500 ring-2 ring-emerald-500/30',
      enabled: caps.canAccessVendor,
      lockedReason: 'Requires registered physical store',
      route: '#merchant'
    },
    {
      id: 'admin' as AppRoute,
      title: 'Admin Control Panel',
      tagline: 'Platform Governance & Master Catalog',
      description: 'Review store verifications, manage categories, inspect audit logs, and configure platform.',
      icon: Shield,
      accentColor: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400',
      activeBorder: 'border-indigo-500 ring-2 ring-indigo-500/30',
      enabled: caps.canAccessAdmin,
      lockedReason: 'Requires Administrator credentials',
      route: '#admin'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight">Choose your Zooner experience</h3>
            <p className="text-xs text-slate-400 mt-0.5">Switch between independent product workspaces</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Experience Cards — Admin only shown to admin users */}
        <div className="space-y-3">
          {experiences.filter(exp => exp.id !== 'admin' || caps.canAccessAdmin).map((exp) => {
            const Icon = exp.icon;
            const isCurrent = currentExperience === exp.id;

            return (
              <div
                key={exp.id}
                onClick={() => {
                  if (exp.enabled) {
                    onSelectExperience(exp.id);
                    onClose();
                  }
                }}
                className={`p-4 rounded-2xl border transition-all ${
                  !exp.enabled
                    ? 'opacity-45 bg-slate-950/40 border-slate-800/50 cursor-not-allowed'
                    : isCurrent
                    ? `${exp.activeBorder} bg-slate-800/80 shadow-lg cursor-pointer`
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-850 cursor-pointer'
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
                        {isCurrent && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium">{exp.tagline}</p>
                    </div>
                  </div>

                  {exp.enabled && !isCurrent && (
                    <ArrowRight className="w-4 h-4 text-slate-400 mt-1" />
                  )}
                </div>

                <p className="text-xs text-slate-400 mt-2.5 pl-13 leading-relaxed">
                  {exp.description}
                </p>

                {!exp.enabled && exp.lockedReason && (
                  <div className="mt-2 pl-13 text-[11px] text-rose-400/80 font-mono">
                    🔒 {exp.lockedReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Logged in: <strong className="text-slate-300">{userProfile?.name || 'User'}</strong></span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition cursor-pointer"
          >
            Stay in current view
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
        return { label: 'Admin Panel', icon: Shield, color: 'border-indigo-500/30 text-indigo-400 bg-indigo-950/70' };
      case 'vendor':
        return { label: 'Merchant Portal', icon: Store, color: 'border-emerald-500/30 text-[#34C759] bg-emerald-950/70' };
      case 'customer':
      default:
        return { label: 'Customer App', icon: ShoppingBag, color: 'border-[#007AFF]/30 text-[#007AFF] bg-[#007AFF]/10' };
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

