import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Store, Shield, ArrowDown } from 'lucide-react';
import type { AppRoute } from '../App';

interface ModeTransitionOverlayProps {
  isTransitioning: boolean;
  sourceMode: AppRoute;
  targetMode: AppRoute;
  userName?: string;
  storeName?: string;
}

export const ModeTransitionOverlay: React.FC<ModeTransitionOverlayProps> = ({
  isTransitioning,
  sourceMode,
  targetMode,
  userName = 'Shopper',
  storeName = 'TechWorld'
}) => {
  const getModeInfo = (mode: AppRoute) => {
    switch (mode) {
      case 'vendor':
        return {
          title: 'Store Mode',
          subtitle: storeName || 'My Storefront',
          icon: Store,
          bg: 'bg-emerald-600',
          textColor: 'text-emerald-700',
          badgeBg: 'bg-emerald-50 border-emerald-200'
        };
      case 'admin':
        return {
          title: 'Admin Mode',
          subtitle: 'Platform Governance',
          icon: Shield,
          bg: 'bg-purple-600',
          textColor: 'text-purple-700',
          badgeBg: 'bg-purple-50 border-purple-200'
        };
      case 'customer':
      default:
        return {
          title: 'Shopping Mode',
          subtitle: userName || 'Find & Reserve',
          icon: ShoppingBag,
          bg: 'bg-[#007AFF]',
          textColor: 'text-[#007AFF]',
          badgeBg: 'bg-blue-50 border-blue-200'
        };
    }
  };

  const source = getModeInfo(sourceMode);
  const target = getModeInfo(targetMode);
  const SourceIcon = source.icon;
  const TargetIcon = target.icon;

  return (
    <AnimatePresence>
      {isTransitioning && (
        <motion.div
          key="mode-transition-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeInOut' }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-md pointer-events-none select-none"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-xs bg-white/95 border border-gray-200/80 rounded-3xl p-5 shadow-2xl backdrop-blur-xl text-gray-900 text-center space-y-4"
          >
            {/* Header Hint */}
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Switching Mode
            </div>

            {/* Context Morph Container */}
            <div className="space-y-2 py-1">
              {/* Source Mode Box (Fading) */}
              <motion.div
                initial={{ opacity: 1, y: 0 }}
                animate={{ opacity: 0.45, scale: 0.96 }}
                transition={{ duration: 0.22 }}
                className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-200/60 text-left"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${source.bg} text-white shadow-2xs shrink-0`}>
                  <SourceIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-gray-400 font-medium">{source.title}</span>
                  <h4 className="text-xs font-bold text-gray-700 truncate">{source.subtitle}</h4>
                </div>
              </motion.div>

              {/* Arrow Indicator */}
              <motion.div
                initial={{ y: -3, opacity: 0.6 }}
                animate={{ y: 2, opacity: 1 }}
                transition={{ repeat: Infinity, repeatType: 'reverse', duration: 0.35 }}
                className="flex justify-center"
              >
                <div className="w-6 h-6 rounded-full bg-gray-100 text-[#007AFF] flex items-center justify-center border border-gray-200 shadow-2xs">
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>
              </motion.div>

              {/* Target Mode Box (Illuminating) */}
              <motion.div
                initial={{ opacity: 0.3, scale: 0.94, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.26, delay: 0.08, ease: 'easeOut' }}
                className="flex items-center gap-3 p-3 rounded-2xl bg-white border-2 border-[#007AFF]/60 text-left shadow-md"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${target.bg} text-white shadow-xs shrink-0`}>
                  <TargetIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className={`text-[10px] font-bold ${target.textColor}`}>{target.title}</span>
                  <h4 className="text-xs font-bold text-gray-950 truncate">{target.subtitle}</h4>
                </div>
              </motion.div>
            </div>

            {/* Micro subtle loader bar */}
            <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="h-full w-1/2 bg-[#007AFF] rounded-full"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
