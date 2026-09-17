import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, ArrowRight, CheckCircle2, Loader2, Sparkles, MapPin } from 'lucide-react';
import { joinWaitlist } from '../services/api';
import type { LocationArea } from '../types';

const WAITLIST_STORAGE_KEY = 'zooner_waitlist_status';

interface WaitlistPopupModalProps {
  currentLocation?: LocationArea;
}

export const WaitlistPopupModal: React.FC<WaitlistPopupModalProps> = ({ currentLocation }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLauncher, setShowLauncher] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [city, setCity] = useState(currentLocation?.city || 'Coimbatore');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Update city if currentLocation updates
  useEffect(() => {
    if (currentLocation?.city && !city) {
      setCity(currentLocation.city);
    }
  }, [currentLocation]);

  // Initial load: 5-second delay or restore sticky launcher
  useEffect(() => {
    try {
      const status = localStorage.getItem(WAITLIST_STORAGE_KEY);
      if (status === 'joined') {
        // User has already joined, never show modal or launcher
        setIsOpen(false);
        setShowLauncher(false);
        return;
      }

      if (status === 'dismissed') {
        // User previously dismissed, do not auto-popup, but display sticky launcher
        setShowLauncher(true);
        return;
      }

      // First time visitor: wait exactly 5 seconds before showing popup
      const timer = setTimeout(() => {
        const currentStatus = localStorage.getItem(WAITLIST_STORAGE_KEY);
        if (currentStatus !== 'joined' && currentStatus !== 'dismissed') {
          setIsOpen(true);
        }
      }, 5000);

      return () => clearTimeout(timer);
    } catch {
      // Fallback for private browsing restrictions
      const timer = setTimeout(() => setIsOpen(true), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleDismiss();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      // Auto-focus email input after modal opens
      const focusTimer = setTimeout(() => {
        emailInputRef.current?.focus();
      }, 150);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        clearTimeout(focusTimer);
      };
    }
  }, [isOpen]);

  const handleDismiss = () => {
    setIsOpen(false);
    if (!isSuccess) {
      setShowLauncher(true);
      try {
        localStorage.setItem(WAITLIST_STORAGE_KEY, 'dismissed');
      } catch {
        // Ignore storage errors
      }
    }
  };

  const handleLauncherClick = () => {
    setShowLauncher(false);
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@') || !email.includes('.')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await joinWaitlist({
        email: email.trim(),
        city: city.trim() || 'Coimbatore',
        userType: 'Shopper'
      });

      if (res.success) {
        setIsSuccess(true);
        setShowLauncher(false);
        try {
          localStorage.setItem(WAITLIST_STORAGE_KEY, 'joined');
        } catch {
          // Ignore storage errors
        }
      } else {
        setErrorMsg(res.message || 'Unable to join waitlist. Please try again.');
      }
    } catch {
      setErrorMsg('Something went wrong. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    setIsOpen(false);
    setShowLauncher(false);
  };

  return (
    <>
      {/* ── STICKY WAITLIST LAUNCHER (FIXED ON RIGHT SIDE) ── */}
      <AnimatePresence>
        {showLauncher && !isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 50, scale: 0.85 }}
            animate={{
              opacity: 1,
              x: 0,
              scale: 1,
              y: [0, -4, 0]
            }}
            exit={{ opacity: 0, x: 50, scale: 0.85 }}
            transition={{
              opacity: { duration: 0.35 },
              x: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
              scale: { duration: 0.35 },
              y: { repeat: Infinity, duration: 3.5, ease: 'easeInOut' }
            }}
            className="fixed right-4 sm:right-6 bottom-6 sm:bottom-8 z-40"
          >
            <button
              onClick={handleLauncherClick}
              aria-label="Open waitlist modal"
              className="group relative flex items-center gap-2.5 rounded-full bg-[#0d1221]/95 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-2xl shadow-indigo-950/60 border border-[#7C5CFF]/40 backdrop-blur-xl hover:border-[#7C5CFF] hover:shadow-[#7C5CFF]/20 hover:scale-[1.03] active:scale-[0.97] transition-all cursor-pointer font-['Outfit']"
            >
              {/* Subtle pulsing dot */}
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#20D99A] opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#20D99A]" />
              </span>

              <Mail className="h-4 w-4 text-[#7C5CFF] group-hover:scale-110 transition-transform" />
              <span className="tracking-tight">Join the waitlist</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── WAITLIST POPUP MODAL (CENTERED) ── */}
      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="waitlist-modal-title"
          >
            {/* Subtle Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={handleDismiss}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              aria-hidden="true"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0d1221] p-6 sm:p-8 text-white shadow-2xl shadow-black/80 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Ambient Background Gradient */}
              <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-[#7C5CFF]/20 blur-[60px]" />
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-[#20D99A]/15 blur-[60px]" />

              {/* Close Button (X) */}
              <button
                onClick={handleDismiss}
                aria-label="Close waitlist dialog"
                className="absolute top-4 right-4 rounded-full p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/50"
              >
                <X className="h-5 w-5" />
              </button>

              {isSuccess ? (
                /* ── SUCCESS STATE ── */
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="py-4 text-center space-y-5"
                >
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#20D99A]/15 border border-[#20D99A]/30 text-[#20D99A]">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>

                  <div className="space-y-2">
                    <h3
                      id="waitlist-modal-title"
                      className="font-['Outfit'] text-2xl sm:text-3xl font-black tracking-tight text-white"
                    >
                      You're on the list! 🎉
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
                      We'll let you know when Zooner launches in your city.
                    </p>
                  </div>

                  <button
                    onClick={handleDone}
                    className="w-full rounded-xl bg-gradient-to-r from-[#4968f5] to-[#7944ed] py-3 text-sm font-bold text-white shadow-lg shadow-[#7257ff]/25 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer font-['Outfit']"
                  >
                    Done
                  </button>
                </motion.div>
              ) : (
                /* ── FORM STATE ── */
                <div className="space-y-6">
                  {/* Header */}
                  <div className="space-y-2 pr-6">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-[#7C5CFF]/30 bg-[#7C5CFF]/10 px-3 py-1 text-[11px] font-bold text-[#A894FF]">
                      <Sparkles className="h-3 w-3" />
                      <span>Zooner is coming soon.</span>
                    </div>

                    <h3
                      id="waitlist-modal-title"
                      className="font-['Outfit'] text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight"
                    >
                      Be the first to know when Zooner launches in your city.
                    </h3>
                  </div>

                  {/* Form */}
                  <form onSubmit={handleSubmit} className="space-y-3.5">
                    {/* Email Input */}
                    <div className="space-y-1">
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          ref={emailInputRef}
                          type="email"
                          required
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (errorMsg) setErrorMsg('');
                          }}
                          placeholder="Enter your email"
                          className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 transition-all focus:border-[#7C5CFF] focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/20"
                        />
                      </div>
                    </div>

                    {/* Optional City Input */}
                    <div className="space-y-1">
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="Your city (optional)"
                          className="w-full rounded-xl border border-slate-700/80 bg-slate-900/90 pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 transition-all focus:border-[#7C5CFF] focus:outline-none focus:ring-2 focus:ring-[#7C5CFF]/20"
                        />
                      </div>
                    </div>

                    {/* Error Message */}
                    {errorMsg && (
                      <p className="text-xs text-rose-400 font-medium">{errorMsg}</p>
                    )}

                    {/* Primary Button */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="group relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4968f5] to-[#7944ed] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#7257ff]/25 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 transition-all cursor-pointer font-['Outfit']"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Joining...</span>
                        </>
                      ) : (
                        <>
                          <span>Join the waitlist</span>
                          <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </button>

                    {/* Privacy Text */}
                    <p className="text-center text-[11px] text-slate-400 font-medium">
                      No spam. Just launch updates.
                    </p>
                  </form>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
