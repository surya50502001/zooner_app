import React from 'react';
import { ShoppingBag, Store, Shield, X, Check, ArrowRight, Plus } from 'lucide-react';
import type { AppRoute } from '../App';

interface ExperienceSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  currentExperience: AppRoute;
  onSelectExperience: (experience: AppRoute) => void;
  onOpenRetailerModal?: () => void;
  userProfile?: {
    name?: string;
    email?: string;
    role?: string;
    isVendor?: boolean;
    shops?: any[];
    storeName?: string;
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
  onOpenRetailerModal,
  userProfile
}) => {
  if (!isOpen) return null;

  const caps = getUserCapabilities(userProfile);
  const storeName = userProfile?.shops?.[0]?.name || userProfile?.storeName || 'My Store';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm bg-white border border-gray-100 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-gray-900 z-10 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-gray-950">Switch Mode</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Two modes, one Zooner account</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode List */}
        <div className="space-y-2.5">
          {/* 1. Shopping Mode Option */}
          <button
            type="button"
            onClick={() => {
              onSelectExperience('customer');
              onClose();
            }}
            className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
              currentExperience === 'customer'
                ? 'bg-blue-50/80 border-[#007AFF] shadow-xs'
                : 'bg-white hover:bg-gray-50 border-gray-200/80'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                currentExperience === 'customer'
                  ? 'bg-[#007AFF] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-gray-950">Shopping</h4>
                  {currentExperience === 'customer' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-[#007AFF]">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 truncate mt-0.5">
                  Find and reserve products nearby
                </p>
              </div>
            </div>

            {currentExperience === 'customer' ? (
              <div className="w-5 h-5 rounded-full bg-[#007AFF] text-white flex items-center justify-center shrink-0 shadow-xs">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            ) : (
              <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
            )}
          </button>

          {/* 2. Store Mode Option (If user is Vendor) */}
          {caps.canAccessVendor ? (
            <button
              type="button"
              onClick={() => {
                onSelectExperience('vendor');
                onClose();
              }}
              className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                currentExperience === 'vendor'
                  ? 'bg-blue-50/80 border-[#007AFF] shadow-xs'
                  : 'bg-white hover:bg-gray-50 border-gray-200/80'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  currentExperience === 'vendor'
                    ? 'bg-[#007AFF] text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  <Store className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-bold text-gray-950">Store</h4>
                    {currentExperience === 'vendor' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-[#007AFF]">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    Manage {storeName}
                  </p>
                </div>
              </div>

              {currentExperience === 'vendor' ? (
                <div className="w-5 h-5 rounded-full bg-[#007AFF] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              ) : (
                <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
              )}
            </button>
          ) : (
            /* 2b. Become a Store Owner Option (If user does not have store yet) */
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onOpenRetailerModal) {
                  onOpenRetailerModal();
                }
              }}
              className="w-full p-3.5 rounded-2xl border border-dashed border-gray-300 hover:border-[#007AFF] hover:bg-blue-50/30 text-left transition-all flex items-center justify-between gap-3 cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-blue-50 text-gray-600 group-hover:text-[#007AFF] flex items-center justify-center shrink-0 transition-colors">
                  <Plus className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-gray-950 group-hover:text-[#007AFF] transition-colors">
                    Become a Store Owner
                  </h4>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    Create and manage your store on Zooner
                  </p>
                </div>
              </div>

              <span className="text-xs font-bold text-[#007AFF] shrink-0">
                Create →
              </span>
            </button>
          )}

          {/* 3. Admin Portal Option (Only if user has Admin role) */}
          {caps.canAccessAdmin && (
            <button
              type="button"
              onClick={() => {
                onSelectExperience('admin');
                onClose();
              }}
              className={`w-full p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                currentExperience === 'admin'
                  ? 'bg-purple-50 border-purple-500 shadow-xs'
                  : 'bg-white hover:bg-gray-50 border-gray-200/80'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  currentExperience === 'admin'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-gray-100 text-purple-600'
                }`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-bold text-gray-950">Admin Portal</h4>
                    {currentExperience === 'admin' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    Platform Governance & Master Catalog
                  </p>
                </div>
              </div>

              {currentExperience === 'admin' ? (
                <div className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              ) : (
                <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
              )}
            </button>
          )}
        </div>

        {/* Account Info Footer */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
          <span className="truncate max-w-[200px]">
            Account: <strong className="text-gray-700 font-semibold">{userProfile?.name || userProfile?.email || 'Guest User'}</strong>
          </span>
          <span className="text-[10px] text-gray-400">Single Login</span>
        </div>
      </div>
    </div>
  );
};

export const ExperienceHeaderPill: React.FC<{
  currentExperience: AppRoute;
  onClick: () => void;
  storeName?: string;
}> = ({ currentExperience, onClick, storeName }) => {
  const getLabel = () => {
    switch (currentExperience) {
      case 'admin':
        return { label: 'Admin Mode', icon: Shield, color: 'border-purple-200 text-purple-700 bg-purple-50' };
      case 'vendor':
        return { label: `Store Mode${storeName ? ` · ${storeName}` : ''}`, icon: Store, color: 'border-blue-200 text-[#007AFF] bg-blue-50' };
      case 'customer':
      default:
        return { label: 'Shopping Mode', icon: ShoppingBag, color: 'border-blue-200 text-[#007AFF] bg-blue-50' };
    }
  };

  const { label, icon: Icon, color } = getLabel();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold shadow-2xs hover:opacity-90 active:scale-[0.97] transition-all cursor-pointer truncate max-w-[220px] ${color}`}
      title="Switch Account Mode"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      <span className="text-[10px] opacity-60">▾</span>
    </button>
  );
};

// Export alias for mode switcher semantics
export const ModeSwitcherModal = ExperienceSwitcherModal;
export const ModeHeaderPill = ExperienceHeaderPill;
