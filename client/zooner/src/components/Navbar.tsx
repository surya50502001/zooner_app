import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, MapPin, Download } from 'lucide-react';
import type { LocationArea } from '../types';

interface NavbarProps {
  currentLocation: LocationArea;
  onOpenLocationModal: () => void;
  onNavigateToVendor: () => void;
  onLaunchCustomerApp?: () => void;
  onOpenSignIn?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentLocation,
  onOpenLocationModal,
  onNavigateToVendor,
  onLaunchCustomerApp,
  onOpenSignIn,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled 
          ? 'bg-white/90 backdrop-blur-xl border-b border-slate-200/80 shadow-lg shadow-slate-900/5' 
          : 'bg-white/60 backdrop-blur-md border-b border-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 sm:px-8">
        <div className="flex h-16 sm:h-20 items-center justify-between">
          
          {/* Left: Brand Logo & Location */}
          <div className="flex items-center gap-6">
            <a href="#" className="flex items-center gap-2 group">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-[#0b1020] font-['Outfit']">
                zooner<span className="text-[#7257ff]">.</span>
              </span>
            </a>

            {/* Location Selector */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onOpenLocationModal}
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-950 border border-slate-200 hover:border-slate-300 rounded-full px-3.5 py-1.5 transition-colors cursor-pointer"
            >
              <MapPin className="h-3 w-3 text-emerald-400" />
              <span className="font-medium">{currentLocation.name || 'RS Puram, Coimbatore'}</span>
            </motion.button>
          </div>

          {/* Right: Desktop Navigation Links & Actions */}
          <div className="hidden md:flex items-center gap-6">
            <nav className="flex items-center gap-6 text-sm tracking-wide text-slate-700 font-semibold">
              <a href="#how-it-works" className="hover:text-slate-950 transition-colors">How It Works</a>
              <button 
                onClick={onNavigateToVendor}
                className="hover:text-slate-950 transition-colors cursor-pointer text-sm font-semibold text-slate-700"
              >
                For Retailers
              </button>
            </nav>

            <div className="flex items-center gap-3">
              <button
                onClick={onNavigateToVendor}
                className="text-xs font-bold text-indigo-700 hover:text-indigo-950 bg-indigo-50 border border-indigo-200/80 px-3.5 py-2 rounded-full transition-colors cursor-pointer"
              >
                Merchant Portal
              </button>

              {onOpenSignIn && (
                <button
                  onClick={onOpenSignIn}
                  className="text-xs font-bold text-slate-700 hover:text-slate-950 px-3 py-2 transition-colors cursor-pointer"
                >
                  Sign In
                </button>
              )}

              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={onLaunchCustomerApp}
                className="text-sm font-bold text-white bg-gradient-to-r from-[#4968f5] to-[#7944ed] hover:brightness-105 px-5 py-2.5 rounded-full transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-[#7257ff]/20"
              >
                <Download className="h-4 w-4" />
                <span>Open Zooner</span>
              </motion.button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2.5">
            <button
              onClick={onOpenLocationModal}
              className="flex items-center gap-1 text-xs text-slate-700 bg-white/80 border border-slate-200 rounded-full px-3 py-1 font-medium"
            >
              <MapPin className="h-3 w-3 text-emerald-400" />
              <span className="truncate max-w-[90px]">{currentLocation.name.split(',')[0]}</span>
            </button>

            <button
              onClick={onNavigateToVendor}
              className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full"
            >
              Merchant
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-700 hover:text-slate-950 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Menu Overlay with AnimatePresence */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="md:hidden bg-white/98 backdrop-blur-2xl border-b border-slate-200 px-6 py-6 space-y-4 overflow-hidden"
          >
            <nav className="flex flex-col space-y-3 text-sm font-medium text-slate-700">
              <a 
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="py-2 border-b border-slate-200"
              >
                How It Works
              </a>
              <button 
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigateToVendor();
                }}
                className="py-2 border-b border-slate-200 text-left font-medium"
              >
                Merchant Portal & Registration
              </button>
            </nav>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigateToVendor();
                }}
                className="w-full text-center py-2.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl"
              >
                Log In as Merchant / Store Owner
              </button>

              {onOpenSignIn && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenSignIn();
                  }}
                  className="w-full text-center py-2.5 text-xs font-bold text-slate-900 border border-slate-300 rounded-xl"
                >
                  Sign In to Shopper Account
                </button>
              )}

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLaunchCustomerApp?.();
                }}
                className="w-full text-center py-3 text-xs font-bold text-white bg-gradient-to-r from-[#4968f5] to-[#7944ed] rounded-xl shadow-md flex items-center justify-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Open Zooner</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

