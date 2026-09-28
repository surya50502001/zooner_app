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
          textColor: 'text-emerald-400',
          borderColor: 'border-emerald-500/30'
        };
      case 'admin':
        return {
          title: 'Admin Mode',
          subtitle: 'Platform Governance',
          icon: Shield,
          bg: 'bg-purple-600',
          textColor: 'text-purple-400',
          borderColor: 'border-purple-500/30'
        };
      case 'customer':
      default:
        return {
          title: 'Shopping Mode',
          subtitle: userName || 'Find & Reserve',
          icon: ShoppingBag,
          bg: 'bg-[#007AFF]',
          textColor: 'text-[#007AFF]',
          borderColor: 'border-blue-500/30'
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
          transition={{ duration: 0.18, ease: 'easeInOut' }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md pointer-events-none selection:bg-transparent"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-xs bg-slate-900/90 border border-slate-700/60 rounded-3xl p-5 shadow-2xl backdrop-blur-2xl text-white text-center space-y-4"
          >
            {/* Header Hint */}
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Switching Context
            </div>

            {/* Context Morph Container */}
            <div className="space-y-2 py-1">
              {/* Source Mode Box (Fading) */}
              <motion.div
                initial={{ opacity: 1, y: 0 }}
                animate={{ opacity: 0.4, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-left"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${source.bg} text-white shadow-xs shrink-0`}>
                  <SourceIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-400 font-medium">{source.title}</span>
                  <h4 className="text-xs font-bold text-slate-200 truncate">{source.subtitle}</h4>
                </div>
              </motion.div>

              {/* Arrow Indicator */}
              <motion.div
                initial={{ y: -4, opacity: 0.5 }}
                animate={{ y: 2, opacity: 1 }}
                transition={{ repeat: Infinity, repeatType: 'reverse', duration: 0.4 }}
                className="flex justify-center"
              >
                <div className="w-6 h-6 rounded-full bg-slate-800 text-blue-400 flex items-center justify-center border border-slate-700 shadow-xs">
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>
              </motion.div>

              {/* Target Mode Box (Illuminating) */}
              <motion.div
                initial={{ opacity: 0.3, scale: 0.92, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
                className={`flex items-center gap-3 p-3 rounded-2xl bg-slate-800/90 border ${target.borderColor} text-left shadow-lg`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${target.bg} text-white shadow-md shrink-0`}>
                  <TargetIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className={`text-[10px] font-bold ${target.textColor}`}>{target.title}</span>
                  <h4 className="text-xs font-bold text-white truncate">{target.subtitle}</h4>
                </div>
              </motion.div>
            </div>

            {/* Micro subtle loader bar */}
            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 0.45, ease: 'easeInOut' }}
                className="h-full w-1/2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
